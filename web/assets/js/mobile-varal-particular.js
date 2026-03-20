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
    console.log("Iniciando Varal Particular Mobile (Sincronizado)... Varal ID:", id);
    
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
            // Varal Global (Comportamento original)
            res = await fetch(`${API_BASE}/varal`, { headers: updateAuthHeaders() });
            const data = await res.json();
            mobileVaralData.nome = data.name || "Meu Varal";
            mobileVaralData.itens = data.items || [];
        }

        document.getElementById("display-nome-varal-mobile").textContent = mobileVaralData.nome;
        
        const namingBar = document.getElementById("naming-bar-mobile");
        if (namingBar) {
            if (mobileVaralData.nome && mobileVaralData.nome !== "Meu Varal" && mobileVaralData.nome !== "Varal Particular") {
                namingBar.classList.add("hidden");
            } else {
                namingBar.classList.remove("hidden");
            }
        }

        renderMobileVaral();
        renderMobileParticipants(id);
    } catch (e) {
        console.error("Erro ao sincronizar Varal Mobile:", e);
    }
}

async function renderMobileParticipants(id) {
    const container = document.getElementById("mobile-participants-list");
    if (!container) return;
    
    // Se for o varal global, podemos ocultar ou mostrar o próprio usuário
    if (!id) {
        container.style.display = "none";
        return;
    }
    
    container.style.display = "flex";
    try {
        const res = await fetch(`${API_BASE}/varais/${id}/participants`, { headers: updateAuthHeaders() });
        const users = await res.json();
        container.innerHTML = "";

        users.forEach(u => {
            if (u.id === currentUser.id) return; // Não mostra o próprio usuário na lista de participantes
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

    // INDEPENDÊNCIA TOTAL: Mostra apenas itens salvos no mobileVaralData.itens
    // que foram postados especificamente aqui ou pessoas incluídas.
    const itens = mobileVaralData.itens;

    if (itens.length === 0) {
        canvas.innerHTML = `<div style="text-align:center; color: #94a3b8; width: 100%; padding: 40px 20px;">
            <p style="font-weight: 800;">Seu Varal Particular está vazio!</p>
            <p style="font-size: 12px;">Use os botões abaixo para pendurar fotos ou incluir pessoas.</p>
        </div>`;
        return;
    }

    console.log("Renderizando Varal Particular com", itens.length, "itens");

    // Ordenação cronológica (Oldest to Newest -> Left to Right)
    const sortedItens = [...itens].sort((a, b) => {
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        
        const finalA = isNaN(timeA) || timeA === 0 ? Date.now() : timeA;
        const finalB = isNaN(timeB) || timeB === 0 ? Date.now() : timeB;
        
        return finalA - finalB;
    });

    canvas.innerHTML = sortedItens.map(item => {
        if (item.type === 'post') {
            try {
                const post = typeof item.content === 'string' ? JSON.parse(item.content) : item.content;
                const url = getMediaUrl(post);
                const postType = detectPostType(post, url);
                
                let mediaHtml = postType === "video" 
                    ? `<video src="${url}" muted loop playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>` 
                    : `<img src="${url}" style="width: 100%; height: 100%; object-fit: cover;">`;

                return `
                    <div class="mobile-varal-item" style="scroll-snap-align: center; flex-shrink: 0; width: 260px; height: 380px; background: white; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.08); overflow: hidden; display: flex; flex-direction: column; margin-top: 0; border: none; position: relative;">
                        <button onclick="removerItemMobile('${item.id}', 'post')" style="position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.8); border: none; border-radius: 50%; width: 30px; height: 30px; color: #ef4444; z-index: 10; display: flex; align-items: center; justify-content: center;"><i data-lucide="trash-2" style="width: 16px;"></i></button>
                        <div style="padding: 8px 15px; font-weight: 800; font-size: 13px; border: none;">@${post.author_name || item.author || 'Eu'}</div>
                        <div style="flex: 1; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #fafafa;">
                            ${mediaHtml}
                        </div>
                        ${post.caption ? `<div style="padding: 12px 15px; font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: white;">${post.caption}</div>` : '<div style="height: 10px;"></div>'}
                    </div>
                `;
            } catch (e) {
                console.error("Erro ao processar item de post:", e);
                return "";
            }
        } else if (item.type === 'message') {
            return `
                <div class="mobile-varal-item" style="scroll-snap-align: center; flex-shrink: 0; width: 260px; height: 380px; background: white; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.08); overflow: hidden; display: flex; flex-direction: column; margin-top: 0; border: none; position: relative;">
                    <button onclick="removerItemMobile('${item.id}', 'message')" style="position: absolute; top: 10px; right: 10px; background: rgba(255,255,255,0.8); border: none; border-radius: 50%; width: 30px; height: 30px; color: #ef4444; z-index: 10; display: flex; align-items: center; justify-content: center;"><i data-lucide="trash-2" style="width: 16px;"></i></button>
                    <div style="padding: 8px 15px; font-weight: 800; font-size: 13px; border: none;">@${item.author || (currentUser ? currentUser.name : 'Eu')}</div>
                    <div style="flex: 1; padding: 15px; text-align: center; color: #1e293b; font-size: 16px; font-weight: 700; font-style: italic; display: flex; align-items: center; justify-content: center; background: #fffbeb; line-height: 1.4;">
                        "${item.content}"
                    </div>
                </div>
            `;
        } else if (item.type === 'person') {
            return `
                <div class="mobile-varal-item" style="scroll-snap-align: center; flex-shrink: 0; width: 140px; background: white; border-radius: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); padding: 15px; display: flex; flex-direction: column; align-items: center; gap: 8px; border: 1px solid #f1f5f9; position: relative;">
                    <button onclick="removerItemMobile('${item.id}', 'person')" style="position: absolute; top: 5px; right: 5px; background: none; border: none; color: #ef4444;"><i data-lucide="x-circle" style="width: 14px;"></i></button>
                    <div class="user-avatar" style="width: 50px; height: 50px; font-size: 20px;">${item.content[0].toUpperCase()}</div>
                    <span style="font-weight: 700; font-size: 12px; text-align: center;">${item.content}</span>
                </div>
            `;
        }
        return "";
    }).join("");

    if (window.lucide) lucide.createIcons();

    // LISTENER DE SCROLL PARA SOM (CIRÚRGICO)
    if (canvas) {
        canvas.onscroll = () => {
             updateCenterMobileVaral();
        };
        // Trigger inicial após renderização
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

async function removerItemMobile(id, category) {
    if (!confirm("Deseja remover este item do seu varal?")) return;
    
    try {
        const res = await fetch(`${API_BASE}/varal/item/${id}`, {
            method: "DELETE",
            headers: updateAuthHeaders()
        });
        if (res.ok) {
            mobileVaralData.itens = mobileVaralData.itens.filter(i => i.id != id);
            renderMobileVaral();
        }
    } catch (e) {
        alert("Erro ao remover item.");
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
