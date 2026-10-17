const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL?.trim();

export const serverUrl = (configuredSocketUrl || window.location.origin).replace(/\/+$/, "");
