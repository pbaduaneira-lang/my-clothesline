// Estado inicial
const urlParams = new URLSearchParams(window.location.search);
const currentVaralId = urlParams.get('id');

let varalData = {
    nome: "",
    itens: [] // Itens: { id, type, content }
};

let deleteMode = false;


// Função global para liberar áudio nos navegadores (autoplay policy)
// Ao carregar a página
async function initVaralDesktop() {
    console.log("Iniciando Varal Particular Desktop (Sincronizado)...");
    
    try {
        let res;
        if (currentVaralId) {
            // Carregar Varal Específico (Grupo)
            res = await fetch(`${API_BASE}/varais/${currentVaralId}/items`, { headers: updateAuthHeaders() });
            const items = await res.json();
            
            // Buscar nome do varal (poderia vir no mesmo endpoint, mas vamos ajustar aqui)
            const resInfo = await fetch(`${API_BASE}/varais`, { headers: updateAuthHeaders() });
            const varais = await resInfo.json();
            const meuVaral = varais.find(v => v.id == currentVaralId);
            
            varalData.nome = meuVaral ? meuVaral.name : "Varal Particular";
            varalData.itens = items.map(item => ({
                id: item.id,
                type: item.item_type,
                content: item.content,
                author: item.author_name,
                created_at: item.created_at
            })) || [];
        } else {
            // Comportamento Legado (Global)
            res = await fetch(`${API_BASE}/varal`, { headers: updateAuthHeaders() });
            const data = await res.json();
            varalData.nome = data.name || "Meu Varal";
            varalData.itens = data.items || [];
        }

        document.getElementById("nome-varal").value = varalData.nome;
        document.getElementById("display-nome-varal").textContent = varalData.nome;
        
        const namingBar = document.getElementById("naming-bar");
        if (varalData.nome && varalData.nome !== "Meu Varal" && varalData.nome !== "Varal Particular") {
            if (namingBar) namingBar.classList.add("hidden");
        } else {
            if (namingBar) namingBar.classList.remove("hidden");
        }

        renderVaralItems();
        renderParticipantes();
    } catch (e) {
        console.error("Erro ao sincronizar Varal Desktop:", e);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    initVaralDesktop();
    
    // Habilita rolagem horizontal
    const mainArea = document.querySelector(".varal-main");
    const canvas = document.getElementById("varal-display");
    
    if (canvas && mainArea) { 
        // Lógica replicada da página principal (index.html) para fluidez idêntica e sem atrito
        mainArea.addEventListener('wheel', (evt) => {
            if (evt.deltaY !== 0) {
                // Impede rolagem vertical indesejada
                evt.preventDefault();
                
                // Rola o varal com a mesma distância e animação da Home
                canvas.scrollBy({
                    left: evt.deltaY > 0 ? 350 : -350,
                    behavior: 'smooth'
                });
                
                updateCenterVaral();
            }
        }, { passive: false });

        // Atualiza o centro durante o scroll no canvas
        canvas.addEventListener('scroll', updateCenterVaral);
    }

    // Fechar zoom com ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') fecharZoom();
    });
});

function renderFeed() {
    renderVaralItems();
    // Atualiza a lista de busca se o modal estiver aberto e o feed carregar depois
    const modal = document.getElementById("modal-busca-pessoa");
    if (modal && !modal.classList.contains("hidden")) {
        const termo = document.getElementById("input-busca-modal").value || "";
        renderizarSugestoes(termo);
    }
}

// FUNÇÕES DE AÇÃO

async function salvarNomeVaral() {
    const nomeInput = document.getElementById("nome-varal").value.trim();
    if (!nomeInput) return alert("Por favor, dê um nome ao seu varal!");
    
    try {
        const res = await fetch(`${API_BASE}/varal/name`, {
            method: "POST",
            headers: updateAuthHeaders(),
            body: JSON.stringify({ name: nomeInput })
        });
        if (res.ok) {
            varalData.nome = nomeInput;
            document.getElementById("display-nome-varal").textContent = nomeInput;
            const namingBar = document.getElementById("naming-bar");
            if (namingBar) namingBar.classList.add("hidden");
            console.log("Nome do Varal sincronizado no DB.");
        }
    } catch (e) {
        alert("Erro ao salvar nome no servidor.");
    }
}

// Função mantida apenas para compatibilidade se chamada externamente, mas agora usamos API
function salvarItensLocal() {
    console.warn("salvarItensLocal está depreciado. Usando API.");
}

function renderVaralItems(filter = "") {
    const canvas = document.getElementById("varal-display");
    if (!canvas) return;

    let pessoas = varalData.itens.filter(i => i.type === 'person');
    const nomesPessoas = pessoas.map(p => p.content.toLowerCase());
    
    // FILTRAGEM DE POSTS REAIS (Posts do Nanobanana agora só aparecem se ele for incluído manualmente)
    let postsFiltrados = postsData.filter(post => {
        const autor = (post.author_name || "").toLowerCase();
        return nomesPessoas.includes(autor);
    });

    const itensUnificados = [
        ...varalData.itens.filter(i => i.type === 'message').map(m => ({ 
            ...m, 
            category: 'message', 
            timestamp: new Date(m.created_at || m.id).getTime()
        })),
        ...varalData.itens.filter(i => i.type === 'post').map(postItem => {
            try {
                const postObj = typeof postItem.content === 'string' ? JSON.parse(postItem.content) : postItem.content;
                return {
                    ...postObj,
                    id: postItem.id, // ID da tabela user_varal_items
                    post_id: postObj.id, // ID original do post
                    category: 'post',
                    timestamp: postObj.created_at ? new Date(postObj.created_at).getTime() : 0
                };
            } catch(e) { return null; }
        }).filter(Boolean),
        ...postsFiltrados.map(p => ({ 
            ...p, 
            category: 'post', 
            timestamp: p.created_at ? new Date(p.created_at).getTime() : 0 
        }))
    ];

    // Ordenação cronológica: itens mais recentes (maior timestamp) vão para o final (direita)
    itensUnificados.sort((a, b) => {
        const timeA = isNaN(a.timestamp) || a.timestamp === 0 ? Date.now() : a.timestamp;
        const timeB = isNaN(b.timestamp) || b.timestamp === 0 ? Date.now() : b.timestamp;
        return timeA - timeB;
    });

    if (itensUnificados.length === 0) {
        canvas.innerHTML = `
            <div class="empty-state">
                <i data-lucide="plus-square" style="width: 48px; height: 48px; opacity: 0.3;"></i>
                <p>O seu varal particular está pronto! Use o botão <b>Incluir</b> para trazer as fotos de quem você gosta.</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    canvas.innerHTML = "";

    itensUnificados.forEach(item => {
        const itemDiv = document.createElement("div");
        itemDiv.className = `varal-item`;
        
        // Botão de recolher (lixeira discreta)
        const btnRecolher = `<button class="btn-recolher" onclick="recolherItemDoVaral('${item.id}', '${item.category}', '${item.author_name || item.author || 'esta postagem'}')" title="Recolher do Varal">
            <i data-lucide="trash-2"></i>
        </button>`;

        if (item.category === 'message') {
            const author = item.author || "Usuário";
            itemDiv.innerHTML = `
                <div class="message-board-card">
                    ${btnRecolher}
                    <div class="message-card-header">
                        <div class="user-avatar" style="width:24px; height:24px; font-size:10px;">${author[0].toUpperCase()}</div>
                        <span>${author}</span>
                    </div>
                    <div class="message-text">"${item.content}"</div>
                </div>
            `;
            canvas.appendChild(itemDiv);
        } else if (item.category === 'post') {
            const mediaUrl = getMediaUrl(item);
            const postType = detectPostType(item, mediaUrl);
            
            let mediaHtml = postType === "video" 
                ? `<video class="media" preload="auto" loop autoplay playsinline src="${mediaUrl}" onclick="abrirCinema('${mediaUrl}', 'video')"></video>` 
                : `<img class="media" src="${mediaUrl}" onclick="abrirCinema('${mediaUrl}', 'image')">`;

            const delay = (Math.random() * -5).toFixed(2); // Delay negativo para começar em pontos diferentes
            itemDiv.style.animationDelay = `0s, ${delay}s`; // slideUp começa na hora, swayVaral tem o delay
            
            itemDiv.innerHTML = `
                <div class="photo-card">
                    ${btnRecolher}
                    <div class="photo-card-header">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div class="user-avatar" style="width:20px; height:20px; font-size:9px;">${(item.author_name || item.author || "D")[0].toUpperCase()}</div>
                            ${item.author_name || item.author || "Usuário"}
                        </div>
                    </div>
                    ${item.caption ? `<div class="photo-title" style="font-size:11px; padding: 10px 16px;">${item.caption}</div>` : ""}
                    <div class="media-container">${mediaHtml}</div>
                    <div class="actions">
                        <button class="btn-action-mini" onclick="curtirPost(${item.post_id || item.id})" title="Curtir">
                            <i data-lucide="heart" style="width:14px; height:14px;"></i> <span>${item.likes || 0}</span>
                        </button>
                        <button class="btn-action-mini" onclick="abrirComentariosDesktop(${item.post_id || item.id})" title="Ver Comentários">
                            <i data-lucide="message-circle" style="width:14px; height:14px;"></i> <span>${item.comments?.length || 0}</span>
                        </button>
                        <button class="btn-expand-mini" onclick="abrirCinema('${mediaUrl}', '${postType}')" title="Ampliar">
                            <i data-lucide="maximize-2" style="width:14px; height:14px;"></i>
                        </button>
                    </div>
                </div>
            `;
            canvas.appendChild(itemDiv);
        }
    });

    if (window.lucide) lucide.createIcons();

    // Rola para o final (recentes) e inicializa foco
    setTimeout(() => {
        canvas.scrollTo({ left: canvas.scrollWidth, behavior: 'smooth' });
        setTimeout(updateCenterVaral, 600);
    }, 500);
}

// Lógica de destaque e áudio dinâmico (Igual à tela principal)
function updateCenterVaral() {
    const canvas = document.getElementById("varal-display"); // Changed from .varal-canvas to #varal-display
    if (!canvas) return;
    const items = document.querySelectorAll(".varal-item");
    if (items.length === 0) return;

    const canvasRect = canvas.getBoundingClientRect();
    const centerX = canvasRect.left + canvasRect.width / 2;

    let closestItem = null;
    let minDistance = Infinity;

    items.forEach(item => {
        const rect = item.getBoundingClientRect();
        const itemCenterX = rect.left + rect.width / 2;
        const distance = Math.abs(centerX - itemCenterX);

        if (distance < minDistance) {
            minDistance = distance;
            closestItem = item;
        }

        // Pausa todos os vídeos inicialmente para garantir que só o central toque
        const video = item.querySelector('video');
        if (video) {
            video.pause();
        }
        item.classList.remove("active");
    });

    if (closestItem) {
        closestItem.classList.add("active");
        const activeVideo = closestItem.querySelector('video');
        
        if (activeVideo) {
            // Tenta tocar com som se desbloqueado, senão mudo
            if (audioUnlocked) activeVideo.muted = false;
            
            activeVideo.play().catch(e => {
                console.warn("Autoplay bloqueado no varal, tentando mudo...", e);
                activeVideo.muted = true;
                activeVideo.play().catch(err => console.error("Erro fatal:", err));
            });
        }
    }
}

// INCLUIR COM MODAL DE BUSCA (TELINHA)
function abrirModalBusca() {
    const modal = document.getElementById("modal-busca-pessoa");
    modal.classList.remove("hidden");
    document.getElementById("input-busca-modal").value = ""; // Limpa ao abrir
    renderizarSugestoes(""); // Garante que as sugestões iniciais apareçam
    document.getElementById("input-busca-modal").focus();
}

function fecharModalBusca() {
    const modal = document.getElementById("modal-busca-pessoa");
    modal.classList.add("hidden");
}

let searchTimeout;

function buscarSugestoes(termo) {
    clearTimeout(searchTimeout);
    
    if (!termo || termo.trim() === "") {
        renderizarSugestoes(""); // Volta para sugestões do feed/padrão
        return;
    }

    // Debounce de 300ms para não sobrecarregar a API
    searchTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`${API_BASE}/users/search?q=${encodeURIComponent(termo)}`);
            if (res.ok) {
                const users = await res.json();
                renderSugestoesAPI(users);
            }
        } catch (e) {
            console.error("Erro na busca global:", e);
        }
    }, 300);
}

function renderSugestoesAPI(users) {
    const list = document.getElementById("suggestions-list-modal");
    if (!list) return;

    if (users.length === 0) {
        list.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:20px; color:#94a3b8;">Nenhum usuário encontrado</div>`;
        return;
    }

    list.innerHTML = users.map(u => {
        const nome = u.name || u.username;
        return `
            <div class="suggestion-item-modal" onclick="confirmarInclusao('${nome.replace(/'/g, "\\'")}')">
                <div class="user-avatar" style="width:48px; height:48px; font-size:18px;">${nome[0].toUpperCase()}</div>
                <span style="font-size:14px; font-weight:800; color:#334155; text-align:center;">${nome}</span>
            </div>
        `;
    }).join("");
}

function renderizarSugestoes(termo = "") {
    const list = document.getElementById("suggestions-list-modal");
    if (!list) return;

    // Quando o termo está vazio, usamos os autores do feed como sugestão rápida
    let autores = [...new Set(postsData.map(p => p.author_name).filter(Boolean))];
    
    if (!autores.find(a => a.toLowerCase() === "nanobanana")) {
        autores.push("Nanobanana");
    }

    const filtrados = autores.slice(0, 15);

    list.innerHTML = filtrados.map(a => `
        <div class="suggestion-item-modal" onclick="confirmarInclusao('${a.replace(/'/g, "\\'")}')">
            <div class="user-avatar" style="width:48px; height:48px; font-size:18px;">${a[0].toUpperCase()}</div>
            <span style="font-size:14px; font-weight:800; color:#334155; text-align:center;">${a}</span>
        </div>
    `).join("");
}

async function confirmarInclusao(nome) {
    if (!nome) return;
    
    const existe = varalData.itens.find(i => i.type === 'person' && i.content === nome.trim());
    if (existe) return alert(`${nome} já está no seu varal!`);

    try {
        const urlRequest = currentVaralId ? `${API_BASE}/varais/item` : `${API_BASE}/varal/item`;
        const bodyRequest = { 
            type: 'person', 
            content: nome.trim(),
            varal_id: currentVaralId ? parseInt(currentVaralId) : null
        };

        const res = await fetch(urlRequest, {
            method: "POST",
            headers: updateAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(bodyRequest)
        });

        if (res.ok) {
            const newItem = await res.json();
            varalData.itens.push({
                id: newItem.id,
                type: 'person',
                content: newItem.content
            });
            renderVaralItems();
            renderParticipantes();
            fecharModalBusca();
            document.getElementById("input-busca-modal").value = "";
        }
    } catch (e) {
        alert("Erro ao incluir pessoa no servidor.");
    }
}

function acaoPesquisar() {
    // Agora o botão de pesquisar (lupinha) abre o mesmo modal de inclusão, 
    // pois é lá que os nomes são buscados para escolha.
    abrirModalBusca();
}

function acaoApagar() {
    deleteMode = !deleteMode;
    const body = document.body;
    const btn = document.querySelector(".btn-apagar");
    
    if (deleteMode) {
        body.classList.add("delete-mode-active");
        btn.style.background = "#ef4444";
        btn.style.color = "white";
        // Alerta opcional removido para ser mais fluido, mas o visual mudou
    } else {
        body.classList.remove("delete-mode-active");
        btn.style.background = "";
        btn.style.color = "";
    }
    renderVaralItems();
}

async function deletarItemPorId(id) {
    if (!deleteMode) return;
    
    const item = varalData.itens.find(i => i.id == id);
    if (!item) return;

    if (confirm(`Deseja mesmo tirar "${item.content || 'este item'}" do varal?`)) {
        try {
            const res = await fetch(`${API_BASE}/varal/item/${id}`, {
                method: "DELETE",
                headers: updateAuthHeaders()
            });
            if (res.ok) {
                varalData.itens = varalData.itens.filter(i => i.id != id);
                renderVaralItems();
            }
        } catch (e) {
            alert("Erro ao remover item do servidor.");
        }
    }
}

async function sairDoVaral() {
    if (!currentVaralId) return;
    
    const confirmacao = confirm("Tem certeza que deseja sair deste grupo de Varal Particular?");
    if (!confirmacao) return;

    try {
        const res = await fetch(`${API_BASE}/varais/${currentVaralId}/participants/me`, {
            method: "DELETE",
            headers: updateAuthHeaders()
        });

        if (res.ok) {
            alert("Você saiu do grupo com sucesso.");
            window.close(); // Fecha a janela do varal particular
        } else {
            const err = await res.json();
            alert(err.error || "Erro ao sair do grupo.");
        }
    } catch (e) {
        console.error("Erro ao sair do varal:", e);
        alert("Erro na conexão com o servidor.");
    }
}

async function acaoMensagem() {
    const modal = document.getElementById("modal-escrever-mensagem");
    if (!modal) return;
    modal.classList.remove("hidden");
    document.getElementById("texto-mensagem-varal").value = "";
    document.getElementById("texto-mensagem-varal").focus();
}

function fecharModalMensagem() {
    document.getElementById("modal-escrever-mensagem").classList.add("hidden");
}

async function enviarMensagemModal() {
    const input = document.getElementById("texto-mensagem-varal");
    const msg = input.value.trim();
    if (!msg) return alert("Escreva algo primeiro!");

    try {
        const urlRequest = currentVaralId ? `${API_BASE}/varais/item` : `${API_BASE}/varal/item`;
        const bodyRequest = { 
            type: 'message', 
            content: msg,
            author_name: currentUser ? currentUser.name : "Eu",
            varal_id: currentVaralId ? parseInt(currentVaralId) : null
        };

        const res = await fetch(urlRequest, {
            method: "POST",
            headers: updateAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(bodyRequest)
        });
        if (res.ok) {
            const newItem = await res.json();
            varalData.itens.push({
                id: newItem.id,
                type: 'message',
                content: newItem.content,
                author: newItem.author_name || (currentUser ? currentUser.name : "Eu"),
                created_at: newItem.created_at || new Date().toISOString()
            });
            renderVaralItems();
            fecharModalMensagem();
        }
    } catch (e) {
        alert("Erro ao salvar mensagem.");
    }
}

function scrollVaral(amount) {
    const canvas = document.getElementById("varal-display");
    if (canvas) {
        canvas.scrollBy({ left: amount, behavior: 'smooth' });
    }
}

async function recolherItemDoVaral(id, type, name) {
    const msg = type === 'message' 
        ? `Deseja mesmo remover esta mensagem do varal?` 
        : `Deseja mesmo "recolher" todas as fotos de "${name}" deste varal?`;

    if (confirm(msg)) {
        try {
            let idParaDeletar = id;
            if (type !== 'message') {
                const autorItem = varalData.itens.find(i => i.type === 'person' && i.content === name);
                if (autorItem) idParaDeletar = autorItem.id;
                else return;
            }

            const res = await fetch(`${API_BASE}/varal/item/${idParaDeletar}`, {
                method: "DELETE",
                headers: updateAuthHeaders()
            });
            
            if (res.ok) {
                varalData.itens = varalData.itens.filter(i => i.id != idParaDeletar);
                renderVaralItems();
            }
        } catch (e) {
            alert("Erro ao recolher item.");
        }
    }
}

function scrollSidebar(amount) {
    const sidebar = document.getElementById("sidebar-pessoas");
    if (sidebar) {
        sidebar.scrollBy({ top: amount, behavior: 'smooth' });
    }
}

// FUNÇÕES DE ZOOM (CINEMA MODE)
function abrirCinema(url, type) {
    const modal = document.getElementById("modalZoom");
    const img = document.getElementById("imgZoom");
    const video = document.getElementById("videoZoom");
    if (!modal || !img || !video) return;

    img.style.display = "none";
    video.style.display = "none";

    if (type === 'video') {
        video.src = url;
        video.style.display = "block";
        video.play();
    } else {
        img.src = url;
        img.style.display = "block";
    }
    modal.style.display = "flex";
}

async function pendurarArquivo(input) {
    const file = input.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("is_private", "true");
    formData.append("caption", ""); 
    formData.append("media", file);

    try {
        console.log("Iniciando upload para o varal...");
        const response = await fetch(`${API_BASE}/post`, {
            method: "POST",
            headers: updateAuthHeaders(),
            body: formData
        });

        if (!response.ok) throw new Error("Falha no upload");
        const post = await response.json();

        // Vincula o post ao varal (específico ou global)
        const urlRequest = currentVaralId ? `${API_BASE}/varais/item` : `${API_BASE}/varal/item`;
        await fetch(urlRequest, {
            method: "POST",
            headers: updateAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                varal_id: currentVaralId ? parseInt(currentVaralId) : null,
                type: 'post',
                content: JSON.stringify(post)
            })
        });

        console.log("Upload concluído e vinculado ao varal!");
        input.value = ""; 
        initVaralDesktop(); 
    } catch (e) {
        console.error(e);
        alert("Erro ao pendurar arquivo.");
    }
}

async function renderParticipantes() {
    const container = document.getElementById("lista-pessoas-quadrada");
    if (!container) return;

    try {
        let users = [];
        
        // Se houver um grupo, busca participantes do DB
        if (currentVaralId) {
            try {
                const res = await fetch(`${API_BASE}/varais/${currentVaralId}/participants`, { headers: updateAuthHeaders() });
                if (res.ok) {
                    const dbUsers = await res.json();
                    users = [...dbUsers];
                }
            } catch(e) {}
        }
        
        // Mesclar com as "pessoas" incluídas no varal manualmente
        const pessoasNoVaral = varalData.itens.filter(i => i.type === 'person');
        pessoasNoVaral.forEach(p => {
            if (!users.find(u => u.name === p.content)) {
                users.push({ id: p.id || Math.random(), name: p.content, fallback: true });
            }
        });

        container.innerHTML = "";

        users.forEach(u => {
            const div = document.createElement("div");
            div.className = "pessoa-item-v3";
            div.style = "display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 10px;";
            div.innerHTML = `
                <div class="user-avatar" style="width:55px; height:55px; font-size:22px; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">${u.name[0].toUpperCase()}</div>
                <span style="font-size:11px; font-weight:700; color:#1e293b; text-align:center; max-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${u.name}</span>
            `;
            container.appendChild(div);
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        console.error("Erro ao carregar participantes:", e);
    }
}

function fecharZoom() {
    const modal = document.getElementById("modalZoom");
    const video = document.getElementById("videoZoom");
    if (modal) modal.style.display = "none";
    if (video) {
        video.pause();
        video.src = ""; // Limpa para resetar
    }
}

