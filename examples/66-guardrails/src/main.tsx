/**
 * Entry point for the guardrails example — mounts {@link App} into the DOM.
 *
 * @packageDocumentation
 */

import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);
