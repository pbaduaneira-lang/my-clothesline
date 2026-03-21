// LÓGICA COMPARTILHADA (SHARED LOGIC)

/**
 * Comprime uma imagem antes do upload usando Canvas API.
 * Reduz de 5-15MB (foto de celular) para ~200-500KB.
 * Vídeos são retornados sem alteração.
 * @param {File} file - Arquivo original
 * @param {number} maxWidth - Largura máxima (default: 1200px)
 * @param {number} quality - Qualidade JPEG 0-1 (default: 0.7)
 * @returns {Promise<File>} - Arquivo comprimido ou original (se vídeo)
 */
async function comprimirImagem(file, maxWidth = 1200, quality = 0.7) {
    // Se não for imagem, retorna o original (ex: vídeos)
    if (!file.type.startsWith('image/')) return file;
    // GIFs não devem ser comprimidos (perdem animação)
    if (file.type === 'image/gif') return file;

    return new Promise((resolve) => {
        const img = new Image();
        const reader = new FileReader();
        
        reader.onload = (e) => {
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Redimensiona proporcionalmente se for maior que maxWidth
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) {
                        const compressed = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        console.log(`[Compressão] ${(file.size/1024/1024).toFixed(1)}MB → ${(compressed.size/1024/1024).toFixed(1)}MB`);
                        resolve(compressed);
                    } else {
                        resolve(file); // Fallback: retorna original
                    }
                }, 'image/jpeg', quality);
            };
            img.onerror = () => resolve(file); // Fallback
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(file); // Fallback
        reader.readAsDataURL(file);
    });
}

let postsData = [];
let viewingUserId = null;
let audioUnlocked = false;

// Função global para liberar áudio nos navegadores (autoplay policy)
function initAudioUnlocker() {
    const unlock = () => {
        if (audioUnlocked) return;
        console.log("🔓 Áudio desbloqueado pela interação do usuário.");
        audioUnlocked = true;
        
        // Tenta desmutar vídeos existentes
        document.querySelectorAll('video').forEach(v => {
            v.muted = false;
        });
        
        document.removeEventListener('click', unlock);
        document.removeEventListener('keydown', unlock);
        document.removeEventListener('touchstart', unlock);
    };
    document.addEventListener('click', unlock);
    document.addEventListener('keydown', unlock);
    document.addEventListener('touchstart', unlock);
}

// Inicializa o desbloqueador assim que o script carrega
initAudioUnlocker();

// Funções Utilitárias
function calcularTempo(data) {
    if (!data) return "agora";
    const segundos = Math.floor((new Date() - new Date(data)) / 1000);
    if (segundos < 60) return `${segundos} s`;
    const minutos = Math.floor(segundos / 60);
    if (minutos < 60) return `${minutos} m`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `${horas} h`;
    return `${Math.floor(horas / 24)} d`;
}

function getMediaUrl(post) {
    if (!post) return "https://via.placeholder.com/150?text=Sem+Midia";
    if (post.url) return post.url;
    if (post.media_url) {
        let cleanMediaUrl = post.media_url;
        if (cleanMediaUrl.includes('localhost')) {
            cleanMediaUrl = cleanMediaUrl.replace(/https?:\/\/localhost(:\d+)?/, '');
        }
        if (cleanMediaUrl.startsWith('data:') || cleanMediaUrl.startsWith('http')) return cleanMediaUrl;
        if (cleanMediaUrl.startsWith('/')) return `${window.location.origin}${cleanMediaUrl}`;
        return `${API_BASE}/uploads/${cleanMediaUrl}`;
    }
    return "https://via.placeholder.com/150?text=Sem+Midia";
}

function detectPostType(post, mediaUrl) {
    let postType = post.type;
    if (!postType && mediaUrl) {
        const cleanUrl = mediaUrl.split('?')[0].split('#')[0];
        const ext = cleanUrl.split('.').pop().toLowerCase();
        if (['mp4', 'webm', 'ogg', 'mov', 'quicktime'].includes(ext) || mediaUrl.startsWith('blob:')) {
            postType = post.type || (mediaUrl.startsWith('blob:') ? 'video' : 'image');
        } else {
            postType = 'image';
        }
    }
    if (post.type === 'video') postType = 'video';
    return postType || 'image';
}

// Funções de API Compartilhadas
async function loadFeed(isAuto = false) {
    try {
        const headers = updateAuthHeaders();
        const res = await fetch(`${API_BASE}/feed`, { headers });
        if (!res.ok) throw new Error(`Status: ${res.status}`);
        const posts = await res.json();
        let newPosts = Array.isArray(posts) ? posts : (posts && posts.value ? posts.value : []);

        // FILTRO DE INDEPENDÊNCIA: Remove posts marcados como privados do Varal Particular
        const privatePostIds = JSON.parse(localStorage.getItem("private_post_ids") || "[]");
        newPosts = newPosts.filter(p => !p.is_private && !privatePostIds.includes(p.id));

        if (JSON.stringify(newPosts) === JSON.stringify(postsData) && document.getElementById("feed").innerHTML !== "") return;
        
        postsData = newPosts;
        if (typeof renderFeed === "function") renderFeed();
        if (typeof renderFeedVaralParticular === "function") renderFeedVaralParticular();
    } catch(e) {
        if (!isAuto) console.error("Erro ao carregar feed:", e);
    }
}

async function curtirPost(id) {
    if (!id || typeof id !== 'number') return;
    try {
        await fetch(`${API_BASE}/post/${id}/like`, { method: "POST", headers: updateAuthHeaders() });
        loadFeed();
    } catch(e) { console.error(e); }
}

async function handleComment(event, id) {
    if (event.key === "Enter") {
        const text = event.target.value.trim();
        if (!text) return;
        event.target.value = "";
        try {
            await fetch(`${API_BASE}/post/${id}/comment`, {
                method: "POST",
                headers: updateAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ text })
            });
            loadFeed();
        } catch (e) { console.error(e); }
    }
}

async function deletarPost(id) {
    if (!confirm("Tem certeza que deseja apagar esta foto do seu varal?")) return;
    try {
        const res = await fetch(`${API_BASE}/post/${id}`, {
            method: "DELETE",
            headers: updateAuthHeaders()
        });
        if (!res.ok) throw new Error("Erro ao deletar post");
        loadFeed();
        alert("Post removido com sucesso!");
    } catch (e) { alert(e.message); }
}

async function seguirUsuario(id) {
    try {
        const res = await fetch(`${API_BASE}/follow/${id}`, {
            method: "POST",
            headers: updateAuthHeaders()
        });
        if (!res.ok) throw new Error("Erro ao seguir usuário");
        loadFeed();
    } catch (e) { console.error(e); }
}

async function pararDeSeguir(id) {
    try {
        const res = await fetch(`${API_BASE}/follow/${id}`, {
            method: "DELETE",
            headers: updateAuthHeaders()
        });
        if (!res.ok) throw new Error("Erro ao parar de seguir");
        loadFeed();
    } catch (e) { console.error(e); }
}

// Autenticação e Stats
async function updateProfileStats() {
    if (!currentUser || !token) return;
    try {
        const res = await fetch(`${API_BASE}/users/profile/stats`, { headers: updateAuthHeaders() });
        const data = await res.json();
        const el = document.getElementById("followerCount");
        if (el) el.textContent = data.followers;
    } catch (e) { console.error("Erro ao carregar stats:", e); }
}

async function updateOnlineStatus() {
    if (!currentUser || !token) return;
    try {
        await fetch(`${API_BASE}/heartbeat`, { method: "POST", headers: updateAuthHeaders() });
        const res = await fetch(`${API_BASE}/online-users`);
        if (!res.ok) return;
        const users = await res.json();
        const countEl = document.getElementById("onlineCount");
        if (countEl) countEl.textContent = users.length;
        
        const container = document.getElementById("onlineUsersContainer");
        if (container) {
            if (users.length === 0) {
                container.innerHTML = `<div style="padding: 15px; font-size: 12px; color: #999; text-align: center;">Ninguém online</div>`;
            } else {
                container.innerHTML = users.map(u => `
                    <div class="online-user-item" style="display: flex; align-items: center; gap: 10px; padding: 8px 15px; border-bottom: 1px solid #f1f5f9;">
                        <div style="position: relative;">
                            <div class="user-avatar" style="width: 32px; height: 32px; font-size: 12px; font-weight: 800;">
                                ${u.name.charAt(0).toUpperCase()}
                            </div>
                            <div class="online-dot"></div>
                        </div>
                        <div style="display: flex; flex-direction: column;">
                            <b style="font-size: 13px;">${u.name}</b>
                            <span style="font-size: 11px; color: #94a3b8;">@${u.username}</span>
                        </div>
                    </div>
                `).join("");
            }
        }
    } catch (e) { console.error("Erro ao atualizar status online:", e); }
}

async function updateUnreadCount() {
    if (!currentUser || !token) return;
    try {
        const res = await fetch(`${API_BASE}/messages/unread/count`, { headers: updateAuthHeaders() });
        const data = await res.json();
        const badge = document.getElementById("msgNotificationCount");
        if (badge) {
            if (data.count > 0) {
                badge.textContent = data.count;
                badge.style.display = "flex";
            } else {
                badge.style.display = "none";
            }
        }
    } catch (e) { console.error("Erro ao buscar notificações:", e); }
}

function logout() {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    location.reload();
}
