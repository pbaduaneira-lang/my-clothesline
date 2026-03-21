/**
 * Lógica do Varal Particular Mobile
 */

let mobileVaralData = {
    nome: "",
    itens: []
};

let mobileDeleteMode = false;
let currentVaralIdMobile = null;

async function initMobileVaral(id = null) {
    currentVaralIdMobile = id;
    mobileVaralData.itens = []; // Limpa cache anterior
    renderMobileVaral();        // Mostra estado de limpeza/loading
    
    try {
        let res;
        if (id) {
            // Varal Específico (Grupo)
            res = await fetch(`${API_BASE}/varais/${id}/items`, { headers: updateAuthHeaders() });
            const items = await res.json();
            
            // Buscar info do varal
            const resInfo = await fetch(`${API_BASE}/varais`, { headers: updateAuthHeaders() });
            const varais = await resInfo.json();
            const meuVaral = varais.find(v => v.id == id);
            
            mobileVaralData.nome = meuVaral ? meuVaral.name : "Varal Particular";
            mobileVaralData.itens = items.map(item => ({
                id: item.id,
                type: item.item_type,
                content: item.content,
                author: item.author_name,
                created_at: item.created_at
            })) || [];
        } else {
            // Varal Pessoal (Global)
            res = await fetch(`${API_BASE}/varal`, { headers: updateAuthHeaders() });
            const data = await res.json();
            mobileVaralData.nome = data.name || "Meu Varal Pessoal";
            mobileVaralData.itens = data.items || [];
        }

        document.getElementById("display-nome-varal-mobile").textContent = mobileVaralData.nome;
        
        // Controle de visibilidade do botão sair do grupo (Só aparece se id existir)
        const btnSair = document.getElementById("btn-sair-grupo-mobile");
        if (btnSair) btnSair.style.display = id ? "flex" : "none";

        renderMobileVaral();
        renderMobileParticipants(id);
    } catch (e) {
        console.error("Erro ao sincronizar Varal Mobile:", e);
    }
}

async function renderMobileParticipants(id) {
    const container = document.getElementById("mobile-participants-list");
    if (!container) return;
    
    // Se for o varal pessoal, podemos mostrar apenas o próprio usuário ou ocultar
    if (!id) {
        container.innerHTML = `
            <div class="btn-pessoa-mobile" style="border-color: var(--primary);">
                <div class="avatar-mobile" style="background: var(--primary); color: white;">${currentUser ? currentUser.name[0].toUpperCase() : 'U'}</div>
                <div class="nome-mobile" style="color: var(--primary); font-weight: 800;">Eu</div>
            </div>
        `;
        container.style.display = "flex";
        return;
    }
    
    container.style.display = "flex";
    try {
        const res = await fetch(`${API_BASE}/varais/${id}/participants`, { headers: updateAuthHeaders() });
        const users = await res.json();
        container.innerHTML = "";

        // Adiciona um card especial para o Varal em si ou para o "Eu"
        const meDiv = document.createElement("div");
        meDiv.className = "btn-pessoa-mobile";
        meDiv.style = "border-color: #e2e8f0; opacity: 0.8;";
        meDiv.innerHTML = `
            <div class="avatar-mobile" style="background: #64748b; color: white;">${currentUser ? currentUser.name[0].toUpperCase() : 'U'}</div>
            <div class="nome-mobile">Eu</div>
        `;
        container.appendChild(meDiv);

        users.forEach(u => {
            if (currentUser && u.id === currentUser.id) return;
            const div = document.createElement("div");
            div.className = "btn-pessoa-mobile";
            div.innerHTML = `
                <div class="avatar-mobile">${u.name[0].toUpperCase()}</div>
                <div class="nome-mobile">${u.name}</div>
            `;
            container.appendChild(div);
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        console.error("Erro ao carregar participantes no mobile:", e);
    }
}

// HOOK PARA O SHARED-LOGIC.JS
function renderFeedVaralParticular() {
    console.log("Atualizando Varal Particular a partir do Feed...");
    renderMobileVaral();
}

function renderMobileVaral() {
    const canvas = document.getElementById("mobile-varal-canvas");
    if (!canvas) return;

    // PARIDADE: Filtragem dinâmica de posts do Nanobanana ou pessoas incluídas
    let pessoas = mobileVaralData.itens.filter(i => i.type === 'person');
    const nomesPessoas = pessoas.map(p => p.content.toLowerCase());
    
    let postsFiltrados = postsData.filter(post => {
        const autor = (post.author_name || "").toLowerCase();
        return nomesPessoas.includes(autor);
    });

    // Unificação de itens (Mensagens, Posts explícitos e Posts filtrados)
    const itensUnificados = [
        ...mobileVaralData.itens.filter(i => i.type === 'message').map(m => ({ 
            ...m, 
            category: 'message', 
            timestamp: new Date(m.created_at || 0).getTime()
        })),
        ...mobileVaralData.itens.filter(i => i.type === 'post').map(postItem => {
            try {
                const postObj = typeof postItem.content === 'string' ? JSON.parse(postItem.content) : postItem.content;
                return {
                    ...postObj,
                    id: postItem.id, // ID da tabela user_varal_items
                    post_id: postObj.id, 
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

    if (itensUnificados.length === 0) {
        canvas.innerHTML = `<div style="text-align:center; color: #94a3b8; width: 100%; padding: 40px 20px;">
            <p style="font-weight: 800;">Seu Varal Particular está vazio!</p>
            <p style="font-size: 12px;">Use os botões abaixo para pendurar fotos ou incluir pessoas.</p>
        </div>`;
        return;
    }

    // Ordenação cronológica (Esquerda -> Direita / Antigo -> Novo)
    itensUnificados.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    canvas.innerHTML = itensUnificados.map(item => {
        if (item.category === 'post') {
            const mediaUrl = getMediaUrl(item);
            const postType = detectPostType(item, mediaUrl);
            
            let mediaHtml = postType === "video" 
                ? `<video src="${mediaUrl}" muted loop playsinline style="width: 100%; height: 100%; object-fit: cover;" onclick="abrirCinemaMobile('${mediaUrl}', 'video')"></video>` 
                : `<img src="${mediaUrl}" style="width: 100%; height: 100%; object-fit: cover;" onclick="abrirCinemaMobile('${mediaUrl}', 'image')">`;

            return `
                <div class="mobile-varal-item" style="scroll-snap-align: center; flex-shrink: 0; width: 260px; height: 380px; background: white; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.08); overflow: hidden; display: flex; flex-direction: column; position: relative;">
                    <button onclick="removerItemMobile('${item.id}', 'post', '${item.author_name || item.author}')" style="position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.8); border: none; border-radius: 50%; width: 30px; height: 30px; color: #ef4444; z-index: 10; display: flex; align-items: center; justify-content: center;"><i data-lucide="trash-2" style="width: 16px;"></i></button>
                    <div style="padding: 8px 15px; font-weight: 800; font-size: 13px; border: none;">@${item.author_name || item.author || 'Eu'}</div>
                    <div style="flex: 1; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #fafafa;">
                        ${mediaHtml}
                    </div>
                    ${item.caption ? `<div style="padding: 12px 15px; font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: white;">${item.caption}</div>` : '<div style="height: 10px;"></div>'}
                </div>
            `;
        } else if (item.category === 'message') {
            return `
                <div class="mobile-varal-item" style="scroll-snap-align: center; flex-shrink: 0; width: 260px; height: 380px; background: white; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.08); overflow: hidden; display: flex; flex-direction: column; position: relative;">
                    <button onclick="removerItemMobile('${item.id}', 'message')" style="position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.8); border: none; border-radius: 50%; width: 30px; height: 30px; color: #ef4444; z-index: 10; display: flex; align-items: center; justify-content: center;"><i data-lucide="trash-2" style="width: 16px;"></i></button>
                    <div style="padding: 8px 15px; font-weight: 800; font-size: 13px; border: none;">@${item.author || (currentUser ? currentUser.name : 'Eu')}</div>
                    <div style="flex: 1; padding: 15px; text-align: center; color: #1e293b; font-size: 16px; font-weight: 700; font-style: italic; display: flex; align-items: center; justify-content: center; background: #fffbeb; line-height: 1.4;">
                        "${item.content}"
                    </div>
                </div>
            `;
        }
        return "";
    }).join("");

    if (window.lucide) lucide.createIcons();

    // Rola para o final após carregar (recém pendurados à direita)
    setTimeout(() => {
        canvas.scrollTo({ left: canvas.scrollWidth, behavior: 'smooth' });
    }, 300);

    if (canvas) {
        canvas.onscroll = () => {
             updateCenterMobileVaral();
        };
        setTimeout(updateCenterMobileVaral, 600);
    }
}

function updateCenterMobileVaral() {
    const canvas = document.getElementById("mobile-varal-canvas");
    const items = document.querySelectorAll(".mobile-varal-item");
    if (!canvas || items.length === 0) return;

    const canvasRect = canvas.getBoundingClientRect();
    const centerX = canvasRect.left + (canvasRect.width / 2);

    items.forEach(item => {
        const video = item.querySelector("video");
        if (!video) return;

        const rect = item.getBoundingClientRect();
        const itemCenterX = rect.left + (rect.width / 2);
        const distance = Math.abs(centerX - itemCenterX);

        // Se estiver bem no centro (tolerância para mobile)
        if (distance < 100) {
            if (typeof audioUnlocked !== 'undefined' && audioUnlocked) {
                if (video.muted) {
                    video.muted = false;
                    video.play().catch(e => console.log("Erro som mobile:", e));
                }
            } else {
                video.muted = true;
                video.play().catch(e => {});
            }
        } else {
            video.pause();
            video.muted = true;
        }
    });
}

async function salvarNomeVaralMobile() {
    const input = document.getElementById("input-nome-varal-mobile");
    const novoNome = input.value.trim();
    if (!novoNome) return;
    
    try {
        const res = await fetch(`${API_BASE}/varal/name`, {
            method: "POST",
            headers: updateAuthHeaders(),
            body: JSON.stringify({ name: novoNome })
        });
        if (res.ok) {
            mobileVaralData.nome = novoNome;
            document.getElementById("display-nome-varal-mobile").textContent = novoNome;
            document.getElementById("naming-bar-mobile").classList.add("hidden");
        }
    } catch (e) {
        alert("Erro ao salvar nome do varal.");
    }
}

function abrirBuscaMobile() {
    document.getElementById("modalBuscaVaralMobile").style.display = "flex";
    renderSugestoesMobile("");
}

function fecharBuscaMobile() {
    document.getElementById("modalBuscaVaralMobile").style.display = "none";
}

function renderSugestoesMobile(termo) {
    const list = document.getElementById("suggestions-list-mobile");
    let autores = [...new Set(postsData.map(p => p.author_name).filter(Boolean))];
    
    list.innerHTML = autores.slice(0, 10).map(a => `
        <div class="suggestion-item-modal" onclick="incluirNoVaralMobile('${a}')">
            <span>${a}</span>
        </div>
    `).join("");
}

async function removerItemMobile(id, type, name = "") {
    const msg = type === 'message' 
        ? "Deseja remover esta mensagem do varal?" 
        : `Deseja remover ${name ? `as fotos de "${name}"` : "este item"} do varal?`;

    if (!confirm(msg)) return;
    
    try {
        let idParaDeletar = id;
        if (type === 'post' && !id.includes('-')) { // Se não for um ID numérico reto, pode ser do postsData
             // Tenta achar o item do varal correspondente
             const itemVaral = mobileVaralData.itens.find(i => i.type === 'person' && i.content === name);
             if (itemVaral) idParaDeletar = itemVaral.id;
        }

        const res = await fetch(`${API_BASE}/varal/item/${idParaDeletar}`, {
            method: "DELETE",
            headers: updateAuthHeaders()
        });
        if (res.ok) {
            mobileVaralData.itens = mobileVaralData.itens.filter(i => i.id != idParaDeletar);
            renderMobileVaral();
        }
    } catch (e) {
        alert("Erro ao remover item.");
    }
}

async function sairDoVaralMobile() {
    if (!currentVaralIdMobile) return;
    if (!confirm("Tem certeza que deseja sair deste grupo de Varal Particular?")) return;

    try {
        const res = await fetch(`${API_BASE}/varais/${currentVaralIdMobile}/participants/me`, {
            method: "DELETE",
            headers: updateAuthHeaders()
        });

        if (res.ok) {
            alert("Você saiu do grupo com sucesso.");
            fecharVaralParticular();
        } else {
            const err = await res.json();
            alert(err.error || "Erro ao sair do grupo.");
        }
    } catch (e) {
        console.error("Erro ao sair do varal mobile:", e);
        alert("Erro na conexão com o servidor.");
    }
}

function abrirCinemaMobile(url, type) {
    if (typeof ampliarMediaMobile === "function") {
        ampliarMediaMobile(url, type);
    }
}

async function incluirNoVaralMobile(nome) {
    if (mobileVaralData.itens.find(i => i.content === nome && i.type === 'person')) return alert("Já incluído!");
    
    try {
        const urlRequest = currentVaralIdMobile ? `${API_BASE}/varais/item` : `${API_BASE}/varal/item`;
        const bodyRequest = { 
            type: 'person', 
            content: nome,
            varal_id: currentVaralIdMobile ? parseInt(currentVaralIdMobile) : null
        };

        const res = await fetch(urlRequest, {
            method: "POST",
            headers: updateAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(bodyRequest)
        });
        if (res.ok) {
            const newItem = await res.json();
            mobileVaralData.itens.push({ 
                id: newItem.id, 
                type: 'person', 
                content: newItem.content 
            });
            renderMobileVaral();
            fecharBuscaMobile();
        }
    } catch (e) {
        alert("Erro ao incluir pessoa.");
    }
}

function removerPessoaMobile(id) {
    removerItemMobile(id, 'person');
}

function toggleDeleteModeMobile() {
    mobileDeleteMode = !mobileDeleteMode;
    const btn = document.getElementById("btnApagarMobile");
    btn.style.color = mobileDeleteMode ? "white" : "";
    btn.style.background = mobileDeleteMode ? "red" : "";
    renderMobileVaral();
}

async function adicionarMensagemMobile() {
    const msg = prompt("Mensagem para o varal:");
    if (msg) {
        try {
            const urlRequest = currentVaralIdMobile ? `${API_BASE}/varais/item` : `${API_BASE}/varal/item`;
            const bodyRequest = { 
                type: 'message', 
                content: msg,
                author_name: currentUser ? currentUser.name : "Eu",
                varal_id: currentVaralIdMobile ? parseInt(currentVaralIdMobile) : null
            };

            const res = await fetch(urlRequest, {
                method: "POST",
                headers: updateAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify(bodyRequest)
            });
            if (res.ok) {
                const newItem = await res.json();
                mobileVaralData.itens.push({
                    id: newItem.id,
                    type: 'message',
                    content: newItem.content,
                    author: newItem.author_name || (currentUser ? currentUser.name : "Eu"),
                    created_at: newItem.created_at || new Date().toISOString()
                });
                renderMobileVaral();
            }
        } catch (e) {
            alert("Erro ao adicionar mensagem.");
        }
    }
}
