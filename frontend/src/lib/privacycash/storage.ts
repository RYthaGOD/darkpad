/**
 * Browser compatible storage wrapper (replaces node-localstorage)
 */
export class BrowserStorage {
    getItem(key: string): string | null {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage.getItem(key);
        }
        return null;
    }

    setItem(key: string, value: string): void {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(key, value);
        }
    }

    removeItem(key: string): void {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem(key);
        }
    }
}

export const storage = new BrowserStorage();
