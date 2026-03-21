// LÓGICA DE UI MOBILE (APP-MÓVEL)

function renderFeed() {
    const feed = document.getElementById("feed");
    const scene = document.getElementById("scene");
    if (!feed || !scene) return;
    feed.innerHTML = "";
    
    if (postsData.length === 0) {
        feed.innerHTML = `<div style="padding: 40px; text-align: center; color: white;">🧺 Varal limpo!</div>`;
        return;
    }

    postsData.forEach((post, index) => {
        const mediaUrl = getMediaUrl(post);
        const postType = detectPostType(post, mediaUrl);
        const div = document.createElement("div");
        div.className = "postSwiper"; 
        div.dataset.index = index;
        div.innerHTML = `
            <div class="photo-card" onclick="focarItemMobile(${index})">
                <div class="card-header" style="height: 18px; margin: 0; padding: 0 2px;">
                    <span class="card-username" style="font-size: 10px;">@${post.author_name}</span>
                </div>
                
                <div class="media-container">
                    ${postType === 'video' 
                        ? `<video src="${mediaUrl}" muted loop playsinline preload="none"></video>` 
                        : `<img src="${mediaUrl}" loading="lazy">`}
                </div>
            </div>
        `;
        feed.appendChild(div);
    });

    // LISTENER DE SCROLL PARA AUTO-FOCO
    scene.onscroll = () => {
        detectCentralItem();
    };
    
    // Apenas seleciona o primeiro se o foco estiver vazio ou for a primeira carga
    const focusContent = document.getElementById("mobile-focus-content");
    if (postsData.length > 0 && (!focusContent || focusContent.innerHTML === "")) {
        setTimeout(() => updateMobileFocus(postsData[0]), 300);
    }
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

let currentFocusedPostId = null;

function detectCentralItem() {
    const scene = document.getElementById("scene");
    const posts = document.querySelectorAll(".postSwiper");
    if (!scene || posts.length === 0) return;

    const sceneRect = scene.getBoundingClientRect();
    const centerX = sceneRect.left + (sceneRect.width / 2);
    
    let closestPost = null;
    let minDistance = Infinity;

    posts.forEach(post => {
        post.classList.remove("active");
        const rect = post.getBoundingClientRect();
        const postCenterX = rect.left + (rect.width / 2);
        const distance = Math.abs(centerX - postCenterX);
        
        if (distance < minDistance) {
            minDistance = distance;
            closestPost = post;
        }
    });

    if (closestPost) {
        closestPost.classList.add("active");
        const index = closestPost.dataset.index;
        const post = postsData[index];
        
        // CORREÇÃO: Só atualiza se o post for diferente do atual para evitar "piscar" o vídeo
        if (post && post.id !== currentFocusedPostId) {
            currentFocusedPostId = post.id;
            updateMobileFocus(post);
        }
    }
}

function focarItemMobile(index) {
    const postElements = document.querySelectorAll(".postSwiper");
    if (postElements[index]) {
        postElements[index].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
    if (postsData[index]) {
        updateMobileFocus(postsData[index]);
    }
}

function updateMobileFocus(post) {
    const container = document.getElementById("mobile-focus-area");
    const content = document.getElementById("mobile-focus-content");
    if (!container || !content || !post) return;
    
    container.style.display = "flex";
    // Altura controlada pelo mobile.css (#mobile-focus-area)
    const mediaUrl = getMediaUrl(post);
    const postType = detectPostType(post, mediaUrl);
    const commentsHtml = (post.comments || []).map(c => `
        <div style="margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;">
            <b style="color: var(--primary);">@${c.author_name}:</b> 
            <span style="color: #444;">${c.text}</span>
        </div>
    `).join("");
    
    content.innerHTML = `
        <div class="focus-btn-presenter">
            <!-- Botão Pendurar apenas texto -->
            <button class="btn-pendurar-premium" onclick="abrirUpload()">
                PENDURAR
            </button>

            <!-- Novo Botão Varal Particular -->
            <button class="btn-varal-particular-mobile" onclick="abrirSelecaoVaralMobile()">
                VARAL<br>PARTICULAR
            </button>

            <!-- Botões de Ação do Post - Estilo Premium Colorido Diferenciado -->
            <button class="btn-action-premium-pink" onclick="abrirAniversarios()">
                ANIVERSÁRIOS
            </button>

            <button class="btn-action-premium-purple" onclick="abrirInterfaceComentarioMobile(${post.id})">
                COMENTÁRIOS
            </button>

            <button class="btn-action-premium-green" onclick="compartilharPost(${post.id})">
                INDICAR
            </button>

            ${(currentUser && Number(post.author_id) === Number(currentUser.id)) ? `
                <button class="btn-action-premium-orange" onclick="deletarPost(${post.id})">
                    APAGAR
                </button>
            ` : ""}
        </div>
        
        <div class="focus-media-column">
            <div class="focus-media-wrapper">
                ${postType === 'video' 
                    ? `<video id="mobile-focus-video" src="${mediaUrl}" controls autoplay loop playsinline></video>` 
                    : `<img src="${mediaUrl}">`}
                
                <!-- Ícones Diretos sobre a Mídia no Rodapé -->
                <div class="focus-media-overlay-actions">
                    <button class="glass-action-btn btn-share-glass" onclick="compartilharPost(${post.id})">
                        <i data-lucide="send"></i>
                    </button>
                    <button class="glass-action-btn btn-zoom-glass" onclick="ampliarMediaMobile('${mediaUrl}', '${postType}')">
                        <i data-lucide="maximize-2"></i>
                    </button>
                    <button class="glass-action-btn btn-like-glass" onclick="curtirPost(${post.id})">
                        <i data-lucide="heart"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // LÓGICA DE ÁUDIO AUTOMÁTICO PARA O VÍDEO FOCADO
    if (postType === 'video') {
        setTimeout(() => {
            const video = document.getElementById("mobile-focus-video");
            if (video) {
                if (typeof audioUnlocked !== 'undefined' && audioUnlocked) {
                    video.muted = false;
                    video.play().catch(e => console.log("Erro auto-play áudio mobile:", e));
                } else {
                    video.muted = true;
                    video.play().catch(e => {});
                }
            }
        }, 50);
    }
}

async function abrirInterfaceComentarioMobile(postId) {
    const modal = document.getElementById("modalCommentMobile");
    const list = document.getElementById("mobileCommentsList");
    const input = document.getElementById("mobileCommentInput");
    const btn = document.getElementById("btnEnviarComentarioMobile");
    
    if (!modal || !list || !input || !btn) return;
    
    modal.style.display = "flex";
    list.innerHTML = "<div style='text-align:center; padding:20px; color:#666; font-size:14px;'>Carregando comentários...</div>";
    input.value = "";

    // Procura o post nos dados locais para extrair comentários iniciais (mais rápido)
    const post = postsData.find(p => p.id === postId);
    if (post) {
        renderizarListaComentariosMobile(post.comments || []);
    }

    // Configura o botão de envio
    btn.onclick = () => {
        const text = input.value.trim();
        if (text) {
            enviarComentarioMobile(postId, text);
        }
    };

    // Permite enviar com Enter
    input.onkeypress = (e) => {
        if (e.key === "Enter") btn.click();
    };

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderizarListaComentariosMobile(comments) {
    const list = document.getElementById("mobileCommentsList");
    if (!list) return;

    if (comments.length === 0) {
        list.innerHTML = `
            <div style="text-align:center; padding:40px; color:#94a3b8;">
                <i data-lucide="message-square" style="width:40px; height:40px; margin-bottom:10px; opacity:0.3;"></i>
                <p style="font-size:14px;">Seja o primeiro a comentar!</p>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    list.innerHTML = comments.map(c => `
        <div style="background: white; padding: 12px 15px; border-radius: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.02); display: flex; gap: 12px; align-items: flex-start;">
            <div class="user-avatar" style="width: 32px; height: 32px; font-size: 12px; flex-shrink: 0;">${(c.author_name || "U")[0].toUpperCase()}</div>
            <div style="flex: 1;">
                <div style="font-weight: 800; font-size: 13px; color: var(--primary); margin-bottom: 2px;">@${c.author_name}</div>
                <div style="font-size: 14px; color: #334155; line-height: 1.4;">${c.text}</div>
            </div>
        </div>
    `).join("");
    
    // Rola para o final da lista
    setTimeout(() => {
        list.scrollTop = list.scrollHeight;
    }, 100);
}

function fecharCommentMobile() {
    document.getElementById("modalCommentMobile").style.display = "none";
}

async function enviarComentarioMobile(postId, text) {
    const input = document.getElementById("mobileCommentInput");
    try {
        const res = await fetch(`${API_BASE}/post/${postId}/comment`, {
            method: "POST",
            headers: updateAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ text })
        });
        if (res.ok) {
            if (input) input.value = "";
            // Atualiza os dados locais
            await loadFeed(true); 
            // Procura o post atualizado para dar o refresh na lista de comentários do modal
            const updatedPost = postsData.find(p => p.id === postId);
            if (updatedPost) {
                renderizarListaComentariosMobile(updatedPost.comments || []);
                updateMobileFocus(updatedPost); // Também atualiza o card de foco se necessário
            }
        } else {
            alert("Erro ao enviar comentário.");
        }
    } catch (e) { 
        console.error("Erro ao comentar no mobile:", e);
    }
}

function ampliarMediaMobile(url, type) {
    // Reutiliza o sistema imersivo ou um modal simples para zoom
    const overlay = document.createElement("div");
    overlay.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:10000; display:flex; align-items:center; justify-content:center; flex-direction:column;";
    
    overlay.innerHTML = `
        <button onclick="this.parentElement.remove()" style="position:absolute; top:20px; right:20px; background:white; border:none; border-radius:50%; width:40px; height:40px; font-weight:800;">X</button>
        ${type === 'video' 
            ? `<video src="${url}" controls autoplay loop style="width:90%; border-radius:12px;"></video>` 
            : `<img src="${url}" style="width:95%; max-height:80%; object-fit:contain; border-radius:12px;">`}
        <div style="color:white; margin-top:20px; font-family:Outfit; font-weight:600;">Visualização Ampliada</div>
    `;
    document.body.appendChild(overlay);
}

async function abrirAniversarios() {
    const modal = document.getElementById("modalAnniversaries");
    const container = document.getElementById("anniversariesContainerMobile");
    if (!modal || !container) return;

    modal.style.display = "flex";
    container.innerHTML = "<div style='text-align:center; padding:20px;'>Buscando...</div>";

    try {
        const res = await fetch(`${API_BASE}/anniversaries`, { headers: updateAuthHeaders() });
        const users = await res.json();
        container.innerHTML = "";

        if (users.length === 0) {
            container.innerHTML = "<div style='padding:40px;text-align:center;color:#666;'>Nenhum aniversariante neste mês. 🎂</div>";
            return;
        }

        users.forEach(u => {
            const dataObjeto = new Date(u.birth_date);
            const dia = dataObjeto.getUTCDate();
            const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
            const mesStr = meses[dataObjeto.getUTCMonth()];

            const isToday = dia === new Date().getDate();

            const div = document.createElement("div");
            div.className = "glass";
            div.style = `
                display: flex; 
                align-items: center; 
                gap: 15px; 
                padding: 15px; 
                border-radius: 20px; 
                background: ${isToday ? 'linear-gradient(135deg, #fff1f2, #ffffff)' : 'white'};
                border: 1px solid ${isToday ? '#f43f5e' : 'var(--glass-border)'};
                box-shadow: 0 4px 12px rgba(0,0,0,0.05);
            `;

            div.innerHTML = `
                <div style="width: 50px; height: 50px; background: #f0f2f5; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 2px solid ${isToday ? '#f43f5e' : '#ddd'};">
                    <span style="font-size: 16px; font-weight: 900; color: ${isToday ? '#f43f5e' : '#333'}; line-height: 1;">${dia}</span>
                    <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #666;">${mesStr}</span>
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 800; font-size: 15px; color: #1c1e21;">${u.name}</div>
                    <div style="font-size: 12px; color: #64748b; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="map-pin" style="width: 12px;"></i> ${u.residence || 'Local não informado'}
                    </div>
                </div>
                ${isToday ? '<i data-lucide="party-popper" style="color: #f43f5e; width: 24px;"></i>' : ''}
            `;
            container.appendChild(div);
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) { 
        container.innerHTML = "<div style='color: red; text-align: center;'>Erro ao carregar aniversariantes</div>";
    }
}

function fecharAniversarios() {
    document.getElementById("modalAnniversaries").style.display = "none";
}

// LÓGICA DE CHAT MOBILE
let selectedChatIdMobile = null;

async function renderChatListMobile() {
    const container = document.getElementById("chatListContainerMobile");
    if (!container) return;
    container.innerHTML = "<div style='padding:20px;text-align:center;'>Carregando...</div>";

    try {
        const res = await fetch(`${API_BASE}/conversations`, { headers: updateAuthHeaders() });
        const chats = await res.json();
        container.innerHTML = "";

        if (chats.length === 0) {
            container.innerHTML = "<div style='padding:40px;text-align:center;color:#666;'>Nenhuma conversa ainda.</div>";
            return;
        }

        chats.forEach(chat => {
            const div = document.createElement("div");
            div.className = "chat-item";
            div.style = "padding: 15px 20px; border-bottom: 1px solid var(--glass-border); display: flex; align-items: center; gap: 12px;";
            div.onclick = () => abrirConversaMobile(chat.id, chat.name);
            div.innerHTML = `
                <div class="user-avatar" style="width: 40px; height: 40px;">${chat.name[0].toUpperCase()}</div>
                <div style="flex: 1;">
                    <div style="font-weight: 700;">${chat.name}</div>
                    <div style="font-size: 13px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;">
                        ${chat.last_text || "Inicie o papo"}
                    </div>
                </div>
                ${chat.unread_count > 0 ? `<div class="badge" style="position:static;">${chat.unread_count}</div>` : ""}
            `;
            container.appendChild(div);
        });
    } catch (e) { container.innerHTML = "Erro ao carregar"; }
}

function abrirConversaMobile(id, name) {
    selectedChatIdMobile = id;
    document.getElementById("chatHeaderMobile").textContent = name;
    document.getElementById("chatConversationMobile").style.display = "flex";
    renderMessagesMobile(id);
}

function voltarParaListaChat() {
    document.getElementById("chatConversationMobile").style.display = "none";
    selectedChatIdMobile = null;
    renderChatListMobile();
}

async function renderMessagesMobile(otherId) {
    const container = document.getElementById("chatMessagesMobile");
    if (!container) return;
    
    try {
        const res = await fetch(`${API_BASE}/messages/${otherId}`, { headers: updateAuthHeaders() });
        const messages = await res.json();
        container.innerHTML = "";

        messages.forEach(msg => {
            const isMe = Number(msg.sender_id) === Number(currentUser.id);
            const div = document.createElement("div");
            div.style = `
                max-width: 80%;
                padding: 12px 16px;
                border-radius: 20px;
                font-size: 14px;
                align-self: ${isMe ? 'flex-end' : 'flex-start'};
                background: ${isMe ? 'var(--primary)' : '#f0f2f5'};
                color: ${isMe ? 'white' : 'black'};
            `;
            div.textContent = msg.text;
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
        fetch(`${API_BASE}/messages/read/${otherId}`, { method: "POST", headers: updateAuthHeaders() });
    } catch (e) {}
}

async function enviarMensagemMobile() {
    const input = document.getElementById("msgInputMobile");
    const text = input.value.trim();
    if (!text || !selectedChatIdMobile) return;

    try {
        const res = await fetch(`${API_BASE}/messages`, {
            method: "POST",
            headers: updateAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ receiver_id: selectedChatIdMobile, text })
        });
        if (res.ok) {
            input.value = "";
            renderMessagesMobile(selectedChatIdMobile);
        }
    } catch (e) {}
}

// NOTIFICAÇÕES MOBILE
async function renderNotificacoesMobile() {
    const container = document.getElementById("notificationsContainerMobile");
    if (!container) return;
    container.innerHTML = "<div style='padding:20px;text-align:center;'>Carregando...</div>";

    try {
        const res = await fetch(`${API_BASE}/notifications`, { headers: updateAuthHeaders() });
        const notifs = await res.json();
        container.innerHTML = "";

        if (notifs.length === 0) {
            container.innerHTML = "<div style='padding:40px;text-align:center;color:#666;'>Sem novidades.</div>";
            return;
        }

        notifs.forEach(n => {
            const div = document.createElement("div");
            div.style = `padding: 15px; border-bottom: 1px solid var(--glass-border); display: flex; align-items: center; gap: 12px; background: ${n.is_read ? 'transparent' : '#f0f7ff'};`;
            
            let icon = "bell";
            let action = "";
            if (n.type === "like") { icon = "heart"; action = "curtiu seu post"; }
            else if (n.type === "comment") { icon = "message-circle"; action = "comentou no seu post"; }
            else if (n.type === "follow") { icon = "user-plus"; action = "começou a te seguir"; }

            div.innerHTML = `
                <div style="width: 36px; height: 36px; border-radius: 50%; background: #f0f2f5; display: flex; align-items: center; justify-content: center; color: var(--primary);">
                    <i data-lucide="${icon}" style="width: 18px; height: 18px;"></i>
                </div>
                <div style="font-size: 14px;">
                    <span style="font-weight: 800;">${n.actor_name}</span> ${action}
                </div>
            `;
            container.appendChild(div);
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
        setTimeout(() => fetch(`${API_BASE}/notifications/read-all`, { method: "POST", headers: updateAuthHeaders() }), 2000);
    } catch (e) {}
}

// GESTOS (SWIPE) - DESATIVADO PARA MANTER CABEÇALHO FIXO
/* 
let touchStartY = 0;
document.addEventListener('touchstart', e => touchStartY = e.touches[0].clientY);
document.addEventListener('touchend', e => {
    if (document.querySelector(".modal[style*='display: flex']")) return; 
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY - touchEndY;
    if (Math.abs(diff) > 50) {
        if (diff > 0) document.body.classList.add('immersive');
        else document.body.classList.remove('immersive');
    }
});
*/

function abrirVaralParticular(id = null) {
    const modal = document.getElementById("modalVaralParticular");
    if (!modal) return;
    
    modal.classList.add("active");
    modal.style.display = "flex";
    initMobileVaral(id);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function fecharVaralParticular() {
    const modal = document.getElementById("modalVaralParticular");
    if (modal) {
        modal.classList.remove("active");
        modal.style.display = "none";
    }
}

// SINCRONIA DE UPLOAD PRIVADO COM GRUPOS
async function pendurarNoVaralParticular() {
    const fileInput = document.getElementById("mediaFile");
    const caption = document.getElementById("caption").value;
    if (!fileInput.files[0]) return alert("Selecione uma foto ou vídeo");

    const formData = new FormData();
    formData.append("is_private", "true");
    formData.append("caption", caption);
    formData.append("media", fileInput.files[0]);

    try {
        const res = await fetch(`${API_BASE}/post`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` },
            body: formData
        });
        if (!res.ok) throw new Error("Erro ao postar no Varal Particular");
        
        const novoPost = await res.json();
        
        // INDEPENDÊNCIA: Salva o ID localmente como privado
        const privateIds = JSON.parse(localStorage.getItem("private_post_ids") || "[]");
        privateIds.push(novoPost.id);
        localStorage.setItem("private_post_ids", JSON.stringify(privateIds));

        // Salva no Banco de Dados via API Sincronizada (Respeitando o grupo se houver)
        const urlRequest = currentVaralIdMobile ? `${API_BASE}/varais/item` : `${API_BASE}/varal/item`;
        await fetch(urlRequest, {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                varal_id: currentVaralIdMobile ? parseInt(currentVaralIdMobile) : null,
                type: 'post',
                content: JSON.stringify(novoPost)
            })
        });

        fecharUpload();
        console.log("Post Privado enviado e sincronizado no DB.");
        
        // Recarrega o varal com o contexto atual
        initMobileVaral(currentVaralIdMobile);
        loadFeed(); 
    } catch(e) { 
        console.error("Erro no upload privado mobile:", e);
        alert(e.message); 
    }
}

// SELEÇÃO E CRIAÇÃO DE VARAIS MOBILE
let selectedParticipantsMobile = [];

async function abrirSelecaoVaralMobile() {
    const modal = document.getElementById("modalSelectVaralMobile");
    if (modal) {
        modal.style.display = "flex";
        renderSelectVaralListMobile();
    }
}

function fecharSelecaoVaralMobile() {
    document.getElementById("modalSelectVaralMobile").style.display = "none";
}

async function renderSelectVaralListMobile() {
    const container = document.getElementById("selectVaralListMobile");
    if (!container) return;
    
    container.innerHTML = "<div style='text-align:center; padding:40px; color:#666;'>Buscando...</div>";

    try {
        console.log("Chamando API para listar varais...");
        const res = await fetch(`${API_BASE}/varais`, { headers: updateAuthHeaders() });
        console.log("Resposta da API (status):", res.status);
        
        const varais = await res.json();
        container.innerHTML = "";

        // --- OPÇÃO: MEU VARAL PESSOAL (LEGACY) ---
        const personalCard = document.createElement("div");
        personalCard.style = `
            background: linear-gradient(135deg, #ffffff, #f8faff);
            border: 2px solid var(--primary);
            border-radius: 20px;
            padding: 18px;
            display: flex;
            align-items: center;
            gap: 15px;
            box-shadow: 0 4px 15px rgba(24, 119, 242, 0.1);
            margin-bottom: 15px;
        `;
        personalCard.onclick = () => {
            console.log("Abrindo Varal Pessoal (null)");
            fecharSelecaoVaralMobile();
            const modal = document.getElementById("modalVaralParticular");
            if (modal) modal.style.display = "flex";
            if (typeof initMobileVaral === "function") initMobileVaral(null); 
        };
        personalCard.innerHTML = `
            <div style="width: 45px; height: 45px; background: var(--primary); color: white; border-radius: 14px; display: flex; align-items: center; justify-content: center;">
                <i data-lucide="user"></i>
            </div>
            <div style="flex: 1;">
                <div style="font-weight: 800; font-size: 16px; color: var(--primary);">Meu Varal Pessoal</div>
                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">Seu espaço individual</div>
            </div>
            <i data-lucide="star" style="color: #f59e0b; width: 18px;"></i>
        `;
        container.appendChild(personalCard);

        if (!Array.isArray(varais) || varais.length === 0) {
            console.warn("Nenhum grupo particular retornado ou erro no formato.");
            const noGroupsRes = document.createElement("div");
            noGroupsRes.style = "text-align:center; padding:20px; color:#94a3b8; font-size: 13px;";
            noGroupsRes.innerHTML = `<p>${!Array.isArray(varais) ? "Erro no formato dos dados." : "Nenhum grupo particular encontrado."}</p>
                                     <small style="opacity: 0.5;">Status: ${res.status}</small>`;
            container.appendChild(noGroupsRes);
        } else {
            varais.forEach(v => {
                const card = document.createElement("div");
                card.style = `
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 20px;
                    padding: 18px;
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.02);
                    margin-bottom: 10px;
                `;
                card.onclick = () => {
                    console.log("Abrindo Varal de Grupo:", v.id);
                    fecharSelecaoVaralMobile();
                    const modal = document.getElementById("modalVaralParticular");
                    if (modal) modal.style.display = "flex";
                    if (typeof initMobileVaral === "function") initMobileVaral(v.id);
                };

                card.innerHTML = `
                    <div style="width: 45px; height: 45px; background: #f0f7ff; color: #64748b; border-radius: 14px; display: flex; align-items: center; justify-content: center;">
                        <i data-lucide="layers"></i>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 800; font-size: 16px; color: #1e293b;">${v.name}</div>
                        <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${v.participants_count} participantes</div>
                    </div>
                    <i data-lucide="chevron-right" style="color: #cbd5e1; width: 18px;"></i>
                `;
                container.appendChild(card);
            });
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        container.innerHTML = "Erro ao carregar varais.";
    }
}

function abrirModalCriarVaralMobile() {
    fecharSelecaoVaralMobile();
    const modal = document.getElementById("modalCreateVaralMobile");
    modal.style.display = "flex";
    
    selectedParticipantsMobile = [];
    document.getElementById("selectedParticipantsMobile").innerHTML = "";
    document.getElementById("newVaralNameMobile").value = "";
    const searchInput = document.getElementById("searchParticipantMobile");
    searchInput.value = "";
    searchInput.oninput = (e) => buscarParticipantesMobile(e.target.value);
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function fecharModalCriarVaralMobile() {
    document.getElementById("modalCreateVaralMobile").style.display = "none";
}

let searchTaskMobile = null;
async function buscarParticipantesMobile(q) {
    const suggestions = document.getElementById("participantsSuggestionsMobile");
    if (!q || q.length < 2) {
        suggestions.style.display = "none";
        return;
    }

    clearTimeout(searchTaskMobile);
    searchTaskMobile = setTimeout(async () => {
        try {
            const res = await fetch(`${API_BASE}/users/search?q=${encodeURIComponent(q)}`, { headers: updateAuthHeaders() });
            const users = await res.json();
            suggestions.innerHTML = "";
            suggestions.style.display = "block";

            users.forEach(u => {
                if (selectedParticipantsMobile.find(p => p.id === u.id)) return;
                
                const div = document.createElement("div");
                div.style = "padding: 12px 15px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 12px;";
                div.innerHTML = `
                    <div class="user-avatar" style="width:30px; height:30px; font-size:12px;">${u.name[0].toUpperCase()}</div>
                    <div style="font-size:14px; font-weight:600;">${u.name} <small style="color:#64748b;">@${u.username}</small></div>
                `;
                div.onclick = () => {
                    selectedParticipantsMobile.push(u);
                    renderSelectedParticipantsMobile();
                    suggestions.style.display = "none";
                    document.getElementById("searchParticipantMobile").value = "";
                };
                suggestions.appendChild(div);
            });
        } catch (e) {}
    }, 300);
}

function renderSelectedParticipantsMobile() {
    const container = document.getElementById("selectedParticipantsMobile");
    container.innerHTML = selectedParticipantsMobile.map(u => `
        <div style="background: var(--primary); color: white; padding: 6px 12px; border-radius: 20px; font-size: 12px; display: flex; align-items: center; gap: 8px; font-weight: 700;">
            ${u.name}
            <i data-lucide="x" onclick="removerParticipanteMobile(${u.id})" style="width: 14px; height: 14px; cursor: pointer; opacity: 0.8;"></i>
        </div>
    `).join("");
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function removerParticipanteMobile(id) {
    selectedParticipantsMobile = selectedParticipantsMobile.filter(p => p.id !== id);
    renderSelectedParticipantsMobile();
}

async function salvarNovoVaralMobile() {
    const name = document.getElementById("newVaralNameMobile").value.trim();
    if (!name) return alert("Dê um nome ao seu varal!");

    const participants = selectedParticipantsMobile.map(p => p.id);

    try {
        const res = await fetch(`${API_BASE}/varais`, {
            method: "POST",
            headers: updateAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ name, participants })
        });

        if (res.ok) {
            fecharModalCriarVaralMobile();
            alert("Varal criado com sucesso! 🚀");
            abrirSelecaoVaralMobile();
        } else {
            alert("Erro ao criar varal.");
        }
    } catch (e) {
        alert("Erro na conexão.");
    }
}

/** 
 * UPLOAD E COLAR ÁREA DE TRANSFERÊNCIA (MOBILE) 
 */

function previewMediaUploadMobile(event) {
    const file = event.target.files[0];
    if (!file) return limparMediaUploadMobile();
    mostrarPreviewMobile(file);
}

function mostrarPreviewMobile(file) {
    const container = document.getElementById("mediaPreviewContainerMobile");
    const imgPreview = document.getElementById("imagePreviewMobile");
    const vidPreview = document.getElementById("videoPreviewMobile");

    imgPreview.style.display = "none";
    vidPreview.style.display = "none";
    vidPreview.pause();
    vidPreview.removeAttribute("src");
    imgPreview.removeAttribute("src");

    if (file) {
        container.style.display = "flex";
        const fileUrl = URL.createObjectURL(file);
        
        if (file.type.startsWith("image/")) {
            imgPreview.src = fileUrl;
            imgPreview.style.display = "block";
        } else if (file.type.startsWith("video/")) {
            vidPreview.src = fileUrl;
            vidPreview.style.display = "block";
            vidPreview.play().catch(e => {}); // Opcional autoplay mudo no preview
        }
    } else {
        container.style.display = "none";
    }
}

function limparMediaUploadMobile() {
    // Reseta input file se existir e tiver setter seguro
    const fileInput = document.getElementById("mediaFile");
    if(fileInput) fileInput.value = "";
    
    const container = document.getElementById("mediaPreviewContainerMobile");
    if(container) container.style.display = "none";
    
    const vidPreview = document.getElementById("videoPreviewMobile");
    if(vidPreview) {
        vidPreview.pause();
        vidPreview.removeAttribute("src");
    }
    const imgPreview = document.getElementById("imagePreviewMobile");
    if(imgPreview) imgPreview.removeAttribute("src");
}

async function colarMediaAreaTransferenciaMobile() {
    if (!navigator.clipboard || !navigator.clipboard.read) {
        alert("O seu navegador bloqueia a leitura automática sem HTTPS. Segure o dedo na caixa de texto 'Legenda' e selecione 'Colar'.");
        return;
    }

    try {
        const clipboardItems = await navigator.clipboard.read();
        let fileFound = false;

        for (const clipboardItem of clipboardItems) {
            for (const type of clipboardItem.types) {
                if (type.startsWith('image/')) {
                    const blob = await clipboardItem.getType(type);
                    const ext = type.split('/')[1] || 'png';
                    const file = new File([blob], `colado_whatsapp.${ext}`, { type: type });
                    
                    // Injetar no input file
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    document.getElementById('mediaFile').files = dataTransfer.files;
                    
                    mostrarPreviewMobile(file);
                    fileFound = true;
                    // Sucesso visual sutil
                    console.log("Mídia colada com sucesso!");
                    break;
                }
            }
            if(fileFound) break;
        }

        if (!fileFound) {
            alert("Nenhuma imagem encontrada na área de transferência.");
        }
    } catch (err) {
        console.error("Erro ao colar da área de transferência:", err);
    }
}

// FALLBACK NATIVO: Listener global de "paste" para extrair arquivos
document.addEventListener('paste', (e) => {
    const modalUpload = document.getElementById("modalUpload");
    if (modalUpload && window.getComputedStyle(modalUpload).display !== "none") {
        const items = (e.clipboardData || window.clipboardData).items;
        for (let index in items) {
            const item = items[index];
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                if (blob) {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(blob);
                    document.getElementById('mediaFile').files = dataTransfer.files;
                    mostrarPreviewMobile(blob);
                    e.preventDefault();
                    return;
                }
            }
        }
    }
});

// --- GOAL: REDE SOCIAL E LISTAGEM DE VARAIS (AMIGOS E FOLLOW) ---

function abrirAmigosMobile() {
    const modal = document.getElementById("modalAmigosMobile");
    if (modal) {
        modal.style.display = "flex";
        document.getElementById("srchAmigoInput").value = "";
        document.getElementById("amigosListMobile").innerHTML = "<div style='text-align: center; color: #666; padding: 40px;'>Pesquise para encontrar amigos! 🔍</div>";
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function fecharAmigosMobile() {
    document.getElementById("modalAmigosMobile").style.display = "none";
}

let amigoSearchTimer = null;
async function buscarAmigosMobile(q) {
    const container = document.getElementById("amigosListMobile");
    if (!q || q.length < 2) {
        container.innerHTML = "<div style='text-align: center; color: #666; padding: 40px;'>Digite ao menos 2 caracteres...</div>";
        return;
    }

    clearTimeout(amigoSearchTimer);
    amigoSearchTimer = setTimeout(async () => {
        container.innerHTML = "<div style='text-align: center; color: #666; padding: 40px;'>Buscando...</div>";
        try {
            const res = await fetch(`${API_BASE}/users/search?q=${encodeURIComponent(q)}`, { headers: updateAuthHeaders() });
            const users = await res.json();
            renderAmigosListMobile(users);
        } catch (e) {
            container.innerHTML = "Erro ao buscar usuários.";
        }
    }, 400);
}

function renderAmigosListMobile(users) {
    const container = document.getElementById("amigosListMobile");
    if (!container) return;
    container.innerHTML = "";
    if (users.length === 0) {
        container.innerHTML = "<div style='text-align: center; color: #666; padding: 40px;'>Nenhum usuário encontrado.</div>";
        return;
    }
    users.forEach(u => {
        if (currentUser && u.id === currentUser.id) return;
        const div = document.createElement("div");
        div.style = "background: white; border: 1px solid #f1f5f9; border-radius: 15px; padding: 12px; display: flex; align-items: center; gap: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.02);";
        div.innerHTML = `
            <div class="user-avatar" style="width:40px; height:40px; font-size:14px; font-weight:800; background: var(--primary); color:white;">${u.name[0].toUpperCase()}</div>
            <div style="flex: 1;">
                <div style="font-weight: 700; font-size: 14px;">${u.name}</div>
                <div style="font-size: 12px; color: #64748b;">@${u.username}</div>
            </div>
            <button onclick="seguirUsuario(${u.id}, this)" class="btn-pendurar-premium" style="padding: 6px 12px; height: 32px; font-size: 12px; background: #e7f3ff; color: #1877f2; border: none;">
                SEGUIR
            </button>
        `;
        container.appendChild(div);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

async function seguirUsuario(id, btn) {
    try {
        const res = await fetch(`${API_BASE}/follow/${id}`, {
            method: "POST",
            headers: updateAuthHeaders()
        });
        if (res.ok) {
            btn.textContent = "SEGUINDO";
            btn.style.background = "#f0fdf4";
            btn.style.color = "#16a34a";
            btn.disabled = true;
        } else {
            const data = await res.json();
            alert(data.error || "Erro ao seguir");
        }
    } catch (e) { alert("Erro na conexão."); }
}

function renderListaVaraisMobile() {
    if (typeof renderSelectVaralListMobile === "function") {
        renderSelectVaralListMobile();
    }
}
