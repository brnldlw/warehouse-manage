// Must run before the Supabase client reads (and clears) email-link details from the URL.
import './lib/authRedirect'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Remove dark mode class addition
createRoot(document.getElementById("root")!).render(<App />);
