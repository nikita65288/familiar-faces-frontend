const KEY = "ff.token";

export const getAuthToken = () =>
    localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY) ?? null;

export const setAuthToken = (token: string, remember: boolean) => {
    const store = remember ? localStorage : sessionStorage;
    store.setItem(KEY, token);
};

export const clearAuthToken = () => {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
};