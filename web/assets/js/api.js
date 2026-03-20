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

// INTRCEPTADOR GLOBAL DE REQUISIÇÕES
const originFetch = window.fetch;
window.fetch = async function(...args) {
    const response = await originFetch(...args);
    if (response.status === 401) {
        // Se a resposta for 401, a sessão expirou ou é inválida
        console.warn("Sessão expirada. Redirecionando para login...");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        token = null;
        currentUser = null;
        alert("Sessão expirada. Faça login novamente.");
        window.location.reload();
    }
    return response;
};
