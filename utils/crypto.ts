
// A simple salt for demonstration. In a real app, this should be unique per user.
const SALT = "patel_sons_secret_salt";

// Hashes a password using SHA-256
export async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + SALT);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Verifies a password against a hash
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    const newHash = await hashPassword(password);
    return newHash === hash;
}
