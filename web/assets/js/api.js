// CONFIGURAÇÕES DE API E AUTENTICAÇÃO
const API_BASE = window.location.origin;

let currentUser = null;
let token = null;

try {
    currentUser = JSON.parse(localStorage.getItem("user") || "null");
    token = localStorage.getItem("token");
} catch (e) {
    console.warn("Erro ao ler localStorage:", e);
}

function updateAuthHeaders(headers = {}) {
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
}

// INTERCEPTADOR GLOBAL DE REQUISIÇÕES
const originFetch = window.fetch;
window.fetch = async function(...args) {
    const response = await originFetch(...args);
    // Só redireciona se for erro 401 (Não Autorizado) e se tínhamos um token (indicando sessão expirada)
    if (response.status === 401 && localStorage.getItem("token")) {
        console.warn("Sessão expirada ou inválida. Limpando dados...");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        
        // Evita loop infinito: só recarrega se não for uma tentativa de login
        const url = args[0] ? args[0].toString() : "";
        if (!url.includes("/login") && !url.includes("/register")) {
            alert("Sessão expirada. Faça login novamente.");
            window.location.reload();
        }
    }
    return response;
};
