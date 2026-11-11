import { defineConfig } from 'vite';

// The game is published at https://game.emmystack01.com/emmy-hustle/
// Keep this base in sync with the folder name (games/emmy-hustle/) and the
// "emmy-hustle" entry in the root publish.json.
export default defineConfig({
  base: '/emmy-hustle/',
});
