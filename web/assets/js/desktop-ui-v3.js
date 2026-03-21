// LÓGICA DE UI DESKTOP (SITE-WEB)

function renderFeed() {
    const feed = document.getElementById("feed");
    if (!feed) return;
    feed.innerHTML = "";
    
    if (postsData.length === 0) {
        feed.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100vw; height: 100%; text-align: center;">
                <div class="photo-card" style="max-width: 320px; padding: 40px; border-radius: 24px; background: rgba(255,255,255,0.4); border: 2px dashed rgba(24, 119, 242, 0.2); backdrop-filter: blur(10px);">
                    <div style="font-size: 64px; margin-bottom: 24px;">🧺</div>
                    <h2 style="margin: 0 0 12px 0; color: var(--primary); font-size: 22px;">Seu varal está limpo!</h2>
                    <p style="margin: 0; color: var(--text-muted); font-size: 14px; line-height: 1.5;">Que tal pendurar a primeira foto hoje? Seus amigos estão esperando!</p>
                    <button class="btn-pendurar" onclick="abrirUpload()" style="margin: 24px auto 0; padding: 12px 24px;">Pendurar<br><small style="font-size: 10px; opacity: 0.8; font-weight: 400;">Emoções</small></button>
                </div>
            </div>
        `;
        return;
    }

    postsData.forEach((post, index) => {
        const div = document.createElement("div");
        div.className = "post";
        div.style.animationDelay = `${index * 0.2}s`;
        const mediaUrl = getMediaUrl(post);
        const postType = detectPostType(post, mediaUrl);
        
        let safeComments = Array.isArray(post.comments) ? post.comments : [];
        const commentsHtml = safeComments.map(c =>
            `<div style="margin-bottom:4px;border-bottom:1px solid #eee;padding-bottom:2px;">
                <b>${c.author_name || "Anônimo"}:</b> ${c.text}
            </div>`
        ).join("");

        let mediaHtml = postType === "video" 
            ? `<video class="media" preload="none" loop playsinline src="${mediaUrl}" onclick="abrirCinema('${mediaUrl}', 'video')"></video>` 
            : `<img class="media" src="${mediaUrl}" loading="lazy" onclick="abrirCinema('${mediaUrl}', 'image')">`;
        let videoIndicator = postType === "video" ? `<div class="video-indicator"><i data-lucide="play"></i></div>` : "";
        
        div.innerHTML = `
            <div class="clamp"></div>
            <div class="photo-card">
                <div class="photo-card-header" style="font-size: 13px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; width: 100%; border-bottom: 1px solid rgba(0,0,0,0.05); padding-bottom: 8px;">
                    <div style="font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 6px;">
                        <div class="user-avatar" style="width: 24px; height: 24px; font-size: 10px; border-radius: 6px;">${(post.author_name || "D")[0].toUpperCase()}</div>
                        ${post.author_name || "Desconhecido"}
                    </div>
                    ${(currentUser && Number(post.author_id) !== Number(currentUser.id)) ? `
                        <button onclick="${post.is_followed ? `pararDeSeguir(${post.author_id})` : `seguirUsuario(${post.author_id})`}" 
                                class="btn-follow ${post.is_followed ? 'following' : ''}">
                            ${post.is_followed ? 'Seguindo' : 'Seguir'}
                        </button>
                    ` : ""}
                </div>
                ${post.caption ? `<div class="photo-title">${post.caption}</div>` : ""}
                <div class="media-container">${mediaHtml}</div>
                <div class="actions">
                    <button class="btn-action btn-like" onclick="curtirPost(${post.id})" title="Curtir">
                        <i data-lucide="heart" style="width: 18px; height: 18px;"></i>
                        <span>${post.likes || 0}</span>
                    </button>
                    <button class="btn-action btn-expand" onclick="abrirCinema('${mediaUrl}', '${postType}')" title="Ampliar">
                        <i data-lucide="maximize-2" style="width: 18px; height: 18px;"></i>
                    </button>
                    <button class="btn-action btn-share" onclick="compartilharPost(${post.id})" title="Compartilhar">
                        <i data-lucide="share-2" style="width: 18px; height: 18px;"></i>
                    </button>
                    ${(currentUser && Number(post.author_id) === Number(currentUser.id)) ? `
                        <button class="btn-action btn-delete" onclick="deletarPost(${post.id})" title="Deletar">
                            <i data-lucide="trash-2" style="width: 18px; height: 18px;"></i>
                        </button>
                    ` : ""}
                    <button class="btn-action btn-comment" onclick="abrirComentariosDesktop(${post.id})" title="Ver Comentários">
                        <i data-lucide="message-circle" style="width: 18px; height: 18px;"></i>
                        <span>${safeComments.length}</span>
                    </button>
                </div>
                <!-- Comentários removidos da visualização inline conforme pedido -->
                <div style="margin-bottom: 16px;"></div>
            </div>
        `;
        feed.appendChild(div);
    });
    
    // Inicializa os ícones Lucide
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    initDesktopNavigation();
    updateCenter(); // Chama imediatamente
    
    // Rola automaticamente para o final para mostrar os mais recentes (à direita)
    setTimeout(() => {
        feed.scrollTo({ left: feed.scrollWidth, behavior: 'smooth' });
        setTimeout(updateCenter, 600); // Recalcula o centro após o scroll estabilizar
    }, 500);
}

function compartilharPost(id) {
    const url = window.location.href + "?post=" + id;
    navigator.clipboard.writeText(url).then(() => {
        alert("Link do post copiado para a área de transferência!");
    });
}

function updateCenter() {
    const feed = document.getElementById("feed");
    if (!feed) return;
    const posts = document.querySelectorAll(".post");
    if (posts.length === 0) return;
    
    const feedRect = feed.getBoundingClientRect();
    const feedCenterX = feedRect.left + feedRect.width / 2;
    
    let closestPost = null;
    let minDistance = Infinity;

    posts.forEach(p => {
        const rect = p.getBoundingClientRect();
        const postCenterX = rect.left + rect.width / 2;
        const dist = Math.abs(feedCenterX - postCenterX);
        
        if (dist < minDistance) {
            minDistance = dist;
            closestPost = p;
        }
        p.classList.remove("active"); 
        
        // Pausa vídeos que não estão em evidência
        const video = p.querySelector('video');
        if (video) video.pause();
    });
    
    // O mais próximo do centro ganha o zoom e inicia o play de vídeo
    if (closestPost) {
        closestPost.classList.add("active");
        
        // Inicia o vídeo se o post em evidência tiver um
        const activeVideo = closestPost.querySelector('video');
        if (activeVideo) {
            if (activeVideo.paused) {
                // Remove qualquer indicador visual de "play" se necessário e inicia
                const indicator = closestPost.querySelector('.video-indicator');
                if (indicator) indicator.style.opacity = "0";
                
                // Tenta tocar com som, se falhar (bloqueio do browser), toca mudo (fallback)
                if (audioUnlocked) activeVideo.muted = false;
                
                activeVideo.play().catch(e => {
                    console.warn("Autoplay com som bloqueado, tentando mudo...", e);
                    activeVideo.muted = true;
                    activeVideo.play().catch(err => console.error("Falha fatal no autoplay:", err));
                });
            }
        }
    }
}

// MENSAGENS E CHAT
let selectedChatId = null;

async function renderChatList() {
    const container = document.getElementById("chatListContainer");
    if (!container) return;
    container.innerHTML = "<div style='padding:20px;text-align:center;'>Carregando conversas...</div>";

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
            div.style = `padding: 15px 20px; border-bottom: 1px solid var(--glass-border); cursor: pointer; transition: background 0.2s; display: flex; align-items: center; gap: 12px; background: ${selectedChatId == chat.id ? 'rgba(24, 119, 242, 0.1)' : 'transparent'};`;
            div.onclick = () => abrirChat(chat.id, chat.name);
            div.innerHTML = `
                <div class="user-avatar" style="width: 35px; height: 35px; font-size: 14px;">${chat.name[0].toUpperCase()}</div>
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 14px; color: var(--text-main);">${chat.name}</div>
                    <div style="font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">
                        ${chat.last_text || "Inicie uma conversa"}
                    </div>
                </div>
                ${chat.unread_count > 0 ? `<div class="badge" style="position:static; border:none;">${chat.unread_count}</div>` : ""}
            `;
            container.appendChild(div);
        });
    } catch (e) {
        console.error("Erro ao carregar chat list:", e);
        container.innerHTML = "<div style='padding:20px;text-align:center;color:red;'>Erro ao carregar conversas.</div>";
    }
}

async function abrirChat(id, name) {
    selectedChatId = id;
    document.getElementById("chatHeader").textContent = `Chat com ${name}`;
    document.getElementById("chatInputArea").style.display = "block";
    renderChatList(); // Refresh highlighting
    renderMessages(id);
}

async function renderMessages(otherId) {
    const container = document.getElementById("chatMessages");
    if (!container) return;
    
    try {
        const res = await fetch(`${API_BASE}/messages/${otherId}`, { headers: updateAuthHeaders() });
        const messages = await res.json();
        container.innerHTML = "";

        messages.forEach(msg => {
            const isMe = Number(msg.sender_id) === Number(currentUser.id);
            const div = document.createElement("div");
            div.style = `
                max-width: 70%;
                padding: 10px 15px;
                border-radius: 18px;
                font-size: 14px;
                line-height: 1.4;
                align-self: ${isMe ? 'flex-end' : 'flex-start'};
                background: ${isMe ? 'var(--primary)' : '#e4e6eb'};
                color: ${isMe ? 'white' : 'var(--text-main)'};
                box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            `;
            div.textContent = msg.text;
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
        
        // Mark as read
        fetch(`${API_BASE}/messages/read/${otherId}`, { method: "POST", headers: updateAuthHeaders() });
    } catch (e) { console.error("Erro ao carregar mensagens:", e); }
}

async function enviarMensagem() {
    const input = document.getElementById("msgInput");
    const text = input.value.trim();
    if (!text || !selectedChatId) return;

    try {
        const res = await fetch(`${API_BASE}/messages`, {
            method: "POST",
            headers: updateAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ receiver_id: selectedChatId, text })
        });
        if (res.ok) {
            input.value = "";
            renderMessages(selectedChatId);
        }
    } catch (e) { console.error("Erro ao enviar mensagem:", e); }
}

function handleMsgKeyPress(event) {
    if (event.key === "Enter") enviarMensagem();
}

// NOTIFICAÇÕES
async function renderNotificacoes() {
    const container = document.getElementById("notificationsContainer");
    if (!container) return;
    container.innerHTML = "<div style='padding:20px;text-align:center;'>Carregando notificações...</div>";

    try {
        const res = await fetch(`${API_BASE}/notifications`, { headers: updateAuthHeaders() });
        const notifs = await res.json();
        container.innerHTML = "";

        if (notifs.length === 0) {
            container.innerHTML = "<div style='padding:40px;text-align:center;color:#666;'>Tudo limpo por aqui!</div>";
            return;
        }

        notifs.forEach(n => {
            const div = document.createElement("div");
            div.className = "notif-item";
            div.style = `padding: 12px 15px; border-bottom: 1px solid var(--glass-border); display: flex; align-items: center; gap: 12px; transition: background 0.2s; background: ${n.is_read ? 'transparent' : 'rgba(24, 119, 242, 0.05)'};`;
            
            let icon = "bell";
            let text = "";
            if (n.type === "like") { icon = "heart"; text = "curtiu sua foto."; }
            else if (n.type === "comment") { icon = "message-square"; text = "comentou na sua foto."; }
            else if (n.type === "follow") { icon = "user-plus"; text = "começou a te seguir."; }

            div.innerHTML = `
                <div style="width: 32px; height: 32px; border-radius: 50%; background: #f0f2f5; display: flex; align-items: center; justify-content: center; color: var(--primary);">
                    <i data-lucide="${icon}" style="width: 16px; height: 16px;"></i>
                </div>
                <div style="flex: 1;">
                    <span style="font-weight: 700; color: var(--text-main);">${n.actor_name}</span> 
                    <span style="color: var(--text-muted); font-size: 13px;">${text}</span>
                </div>
            `;
            container.appendChild(div);
        });
        
        if (typeof lucide !== 'undefined') lucide.createIcons();
        
        // Mark all as read after a delay
        setTimeout(() => {
            fetch(`${API_BASE}/notifications/read-all`, { method: "POST", headers: updateAuthHeaders() });
        }, 3000);
    } catch (e) {
        console.error("Erro ao carregar notificações:", e);
        container.innerHTML = "<div style='padding:20px;text-align:center;color:red;'>Erro ao carregar.</div>";
    }
}
// Event Listeners Desktop
function initDesktopNavigation() {
    const feedEl = document.getElementById("feed");
    if (!feedEl || feedEl.dataset.navInit) return;
    
    feedEl.dataset.navInit = "true";
    feedEl.addEventListener("scroll", updateCenter);
    feedEl.addEventListener("mousemove", updateCenter); 
    
    // Converter scroll vertical do mouse em rolagem horizontal
    feedEl.addEventListener('wheel', (evt) => {
        if (evt.deltaY !== 0) {
            // Se o deltaY for maior que 0, rala para a direita, senão esquerda
            feedEl.scrollBy({
                left: evt.deltaY > 0 ? 290 : -290,
                behavior: 'smooth'
            });
            evt.preventDefault();
            updateCenter(); 
        }
    }, { passive: false });

    // Chamada inicial para definir o primeiro item como ativo
    updateCenter();
}

// Garante carregamento do Lucide em botões estáticos no onload
document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
    initDesktopNavigation();
});

let privateVarais = [];
let selectedParticipants = [];

function toggleListaVarais() {
    const lista = document.getElementById("lista-varais-privados");
    const isHidden = lista.classList.contains("hidden");
    
    if (isHidden) {
        lista.classList.remove("hidden");
        renderPrivateVaraisList();
    } else {
        lista.classList.add("hidden");
    }
}

async function renderPrivateVaraisList() {
    const container = document.getElementById("itens-varais-privados");
    if (!container) return;
    container.innerHTML = "<div style='font-size:11px; color:#666; padding:5px;'>Carregando...</div>";

    try {
        const res = await fetch(`${API_BASE}/varais`, { headers: updateAuthHeaders() });
        privateVarais = await res.json();
        container.innerHTML = "";

        if (privateVarais.length === 0) {
            container.innerHTML = "<div style='font-size:11px; color:#94a3b8; padding:5px;'>Nenhum varal particular.</div>";
            return;
        }

        privateVarais.forEach(v => {
            const div = document.createElement("div");
            div.style = "padding: 8px 12px; border-radius: 8px; background: rgba(0,0,0,0.03); cursor: pointer; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px; transition: all 0.2s;";
            div.onmouseover = () => div.style.background = "rgba(0,0,0,0.06)";
            div.onmouseout = () => div.style.background = "rgba(0,0,0,0.03)";
            div.onclick = () => abrirVaralSelecionado(v.id, v.name);
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>${v.name}</span>
                    <small style="font-size:10px; opacity:0.6;"><i data-lucide="users" style="width:10px;"></i> ${v.participants_count}</small>
                </div>
            `;
            container.appendChild(div);
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        container.innerHTML = "<div style='color:red; font-size:11px;'>Erro ao carregar.</div>";
    }
}

function abrirVaralSelecionado(id, name) {
    // Abre a página do varal particular passando o ID como parâmetro
    window.open(`varal-particular.html?id=${id}`, '_blank');
}

// NOVO FLUXO DE SELEÇÃO POR MODAL
async function abrirSelecaoVaral() {
    const modal = document.getElementById("modalSelectVaral");
    if (!modal) return;
    
    modal.style.display = "flex";
    renderSelectVaralList();
}

function fecharSelecaoVaral() {
    document.getElementById("modalSelectVaral").style.display = "none";
}

async function renderSelectVaralList() {
    const container = document.getElementById("selectVaralList");
    if (!container) return;
    
    container.innerHTML = "<div style='grid-column: 1/-1; text-align:center; padding:40px; color:#666;'>Buscando seus varais...</div>";

    try {
        const res = await fetch(`${API_BASE}/varais`, { headers: updateAuthHeaders() });
        const varais = await res.json();
        container.innerHTML = "";

        if (varais.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding:40px; color:#94a3b8;">
                    <i data-lucide="inbox" style="width:40px; height:40px; margin-bottom:10px; opacity:0.5;"></i>
                    <p>Você ainda não participa de nenhum varal particular.</p>
                </div>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        varais.forEach(v => {
            const card = document.createElement("div");
            card.className = "varal-select-card";
            card.style = `
                background: white;
                border: 2px solid #f1f5f9;
                border-radius: 18px;
                padding: 20px;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                display: flex;
                flex-direction: column;
                gap: 12px;
                position: relative;
                overflow: hidden;
            `;
            card.onclick = () => {
                fecharSelecaoVaral();
                abrirVaralSelecionado(v.id, v.name);
            };
            
            card.onmouseover = () => {
                card.style.borderColor = "var(--primary)";
                card.style.transform = "translateY(-5px)";
                card.style.boxShadow = "0 10px 20px rgba(24, 119, 242, 0.1)";
            };
            card.onmouseout = () => {
                card.style.borderColor = "#f1f5f9";
                card.style.transform = "translateY(0)";
                card.style.boxShadow = "none";
            };

            card.innerHTML = `
                <div style="width: 40px; height: 40px; background: rgba(24, 119, 242, 0.1); color: var(--primary); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                    <i data-lucide="layers" style="width: 20px; height: 20px;"></i>
                </div>
                <div>
                    <div style="font-weight: 800; font-size: 15px; color: #1e293b; margin-bottom: 4px;">${v.name}</div>
                    <div style="font-size: 11px; color: #64748b; display: flex; align-items: center; gap: 5px;">
                        <i data-lucide="users" style="width: 12px;"></i> ${v.participants_count} participantes
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        container.innerHTML = "<div style='grid-column: 1/-1; color:red; text-align:center;'>Erro ao carregar seus varais.</div>";
    }
}

function abrirModalCriarVaralDesdeSelecao() {
    fecharSelecaoVaral();
    abrirModalCriarVaral();
}

function abrirModalCriarVaral() {
    const modal = document.getElementById("modalCreateVaral");
    modal.style.display = "flex";
    selectedParticipants = [];
    document.getElementById("selectedParticipants").innerHTML = "";
    document.getElementById("newVaralName").value = "";
    document.getElementById("searchParticipant").value = "";
    
    // Configurar busca de participantes
    const input = document.getElementById("searchParticipant");
    input.onkeyup = (e) => buscarParticipantes(e.target.value);
}

function fecharModalCriarVaral() {
    document.getElementById("modalCreateVaral").style.display = "none";
}

let searchTask = null;
async function buscarParticipantes(q) {
    const suggestions = document.getElementById("participantsSuggestions");
    if (!q || q.length < 2) {
        suggestions.style.display = "none";
        return;
    }

    clearTimeout(searchTask);
    searchTask = setTimeout(async () => {
        try {
            const res = await fetch(`${API_BASE}/users/search?q=${encodeURIComponent(q)}`, { headers: updateAuthHeaders() });
            const users = await res.json();
            suggestions.innerHTML = "";
            suggestions.style.display = "block";

            users.forEach(u => {
                if (selectedParticipants.find(p => p.id === u.id)) return;
                
                const div = document.createElement("div");
                div.style = "padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 10px;";
                div.innerHTML = `
                    <div class="user-avatar" style="width:24px; height:24px; font-size:10px;">${u.name[0].toUpperCase()}</div>
                    <span style="font-size:13px;">${u.name} (@${u.username})</span>
                `;
                div.onclick = () => selecionarParticipante(u);
                suggestions.appendChild(div);
            });
        } catch (e) { console.error(e); }
    }, 300);
}

function selecionarParticipante(user) {
    selectedParticipants.push(user);
    renderSelectedParticipants();
    document.getElementById("participantsSuggestions").style.display = "none";
    document.getElementById("searchParticipant").value = "";
}

function removerParticipante(userId) {
    selectedParticipants = selectedParticipants.filter(p => p.id !== userId);
    renderSelectedParticipants();
}

function renderSelectedParticipants() {
    const container = document.getElementById("selectedParticipants");
    container.innerHTML = selectedParticipants.map(u => `
        <div style="background: var(--primary); color: white; padding: 4px 10px; border-radius: 20px; font-size: 11px; display: flex; align-items: center; gap: 5px; font-weight: 600;">
            ${u.name}
            <span onclick="removerParticipante(${u.id})" style="cursor: pointer; opacity: 0.8;">&times;</span>
        </div>
    `).join("");
}

async function salvarNovoVaral() {
    const name = document.getElementById("newVaralName").value.trim();
    if (!name) return alert("Por favor, digite um nome para o varal.");

    const participantsIds = selectedParticipants.map(p => p.id);

    try {
        const res = await fetch(`${API_BASE}/varais`, {
            method: "POST",
            headers: updateAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ name, participants: participantsIds })
        });

        if (res.ok) {
            fecharModalCriarVaral();
            renderPrivateVaraisList();
            alert("Varal criado com sucesso! 🎉");
        } else {
            alert("Erro ao criar varal.");
        }
    } catch (e) {
        console.error(e);
        alert("Erro na conexão com o servidor.");
    }
}

function criarVaralParticular() {
    // Função legada mantida para não quebrar referências, agora abre a lista
    toggleListaVarais();
}

function verAniversariantes() {
    // Refatorado para o novo modal no index.html (se chamado via script global)
    if (typeof window.verAniversariantes === "function" && !window.location.href.includes('varal-particular.html')) {
        // Já existe no index.html
    } else {
        alert("Lista de aniversariantes sincronizada!");
    }
}

function abrirTermos() {
    alert("Abrindo Termos de Uso e Política de Privacidade...");
}

function verSugestoes() {
    alert("Procurando as melhores sugestões de conexões para você! ✨");
}
// COMENTÁRIOS DESKTOP COMPLETO
async function abrirComentariosDesktop(postId) {
    const post = postsData.find(p => p.id === postId);
    if (!post) return;

    const modal = document.getElementById("modalCommentsDesktop");
    const mediaContainer = document.getElementById("desktopCommentMedia");
    const list = document.getElementById("desktopCommentsList");
    const authorInfo = document.getElementById("desktopCommentAuthor");
    const btn = document.getElementById("btnEnviarComentarioDesktop");
    const input = document.getElementById("inputCommentDesktop");

    modal.style.display = "flex";
    authorInfo.textContent = `Post de ${post.author_name}`;
    input.value = "";
    
    // Render Mídia
    const mediaUrl = getMediaUrl(post);
    const postType = detectPostType(post, mediaUrl);
    mediaContainer.innerHTML = postType === 'video' 
        ? `<video src="${mediaUrl}" controls autoplay style="max-width:100%; max-height:100%;"></video>`
        : `<img src="${mediaUrl}" style="max-width:100%; max-height:100%; object-fit:contain;">`;

    renderizarListaComentariosDesktop(post.comments || []);

    btn.onclick = () => enviarComentarioDesktop(postId);
    input.onkeypress = (e) => { if (e.key === "Enter") btn.onclick(); };

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function fecharComentariosDesktop() {
    document.getElementById("modalCommentsDesktop").style.display = "none";
}

function renderizarListaComentariosDesktop(comments) {
    const list = document.getElementById("desktopCommentsList");
    if (comments.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding:50px; color:#94a3b8;">Nenhum comentário ainda. Seja o primeiro!</div>`;
        return;
    }

    list.innerHTML = comments.map(c => `
        <div class="desktop-comment-item">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
                <div class="user-avatar" style="width:24px; height:24px; font-size:10px;">${(c.author_name || "U")[0].toUpperCase()}</div>
                <b style="font-size:13px; color:var(--primary);">@${c.author_name}</b>
            </div>
            <div style="font-size:14px; color:#334155; line-height:1.4;">${c.text}</div>
        </div>
    `).join("");
    
    list.scrollTop = list.scrollHeight;
}

async function enviarComentarioDesktop(postId) {
    const input = document.getElementById("inputCommentDesktop");
    const text = input.value.trim();
    if (!text) return;

    try {
        const res = await fetch(`${API_BASE}/post/${postId}/comment`, {
            method: "POST",
            headers: updateAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ text })
        });
        if (res.ok) {
            input.value = "";
            await loadFeed(true); // Recarrega feed para pegar o novo comentário
            const updatedPost = postsData.find(p => p.id === postId);
            if (updatedPost) renderizarListaComentariosDesktop(updatedPost.comments || []);
        }
    } catch (e) { console.error("Erro ao comentar desktop:", e); }
}
