
import { db } from './services/firebase';

async function test() {
    try {
        await db.getUser("test");
    } catch (e) {
        console.error(e);
    }
}

test();
