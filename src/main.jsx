import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './globals.css';
import '../styles.css';
import './portal-theme.css';

createRoot(document.getElementById('root')).render(<App />);
