// FAINTR settings. None of these are secrets: the Supabase publishable (anon) key is meant to be public.
// On the website these come from GitHub repository variables (see docs/WEBSITE_SETUP.md), so you never edit this file.
window.FAINTR_CONFIG = Object.assign({
  discordUrl: 'https://discord.gg/9TH65yzsK',
  patreonUrl: '',          // e.g. 'https://www.patreon.com/yourpage'
  supabaseUrl: '',         // e.g. 'https://abcdefgh.supabase.co' (website accounts and bug reports)
  supabaseAnonKey: '',     // Supabase > Project Settings > API Keys > publishable key (or the legacy anon key)
  loginProviders: '',      // extra sign-in buttons turned on in Supabase, e.g. 'discord,google'
}, window.FAINTR_CONFIG || {});
