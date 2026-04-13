export const getAuthToken = (): string | null => {
    return localStorage.getItem("token") ?? sessionStorage.getItem("token");
};

export const setAuthToken = (token: string) => {
    localStorage.setItem("token", token);
    sessionStorage.setItem("token", token);
};

export const clearAuthToken = () => {
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
};