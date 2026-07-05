// src/TapWidget.jsx
import { useEffect } from 'react';

export default function TapWidget() {
  useEffect(() => {
    // 1. Prevents duplicate script appending during React StrictMode re-renders
    if (document.getElementById('tap-ai-widget-script')) return;

    // 2. Initialize the global callback command queue
    window.TapAI = window.TapAI || function () {
      (window.TapAI.q = window.TapAI.q || []).push(arguments);
    };

    // 3. Create the remote script tag element dynamically
    const script = document.createElement('script');
    script.id = 'tap-ai-widget-script';
    script.src = 'https://tutpug.qzz.io/widget.js';
    script.async = true;

    // 4. Inject the script element cleanly to start the download
    document.body.appendChild(script);

    // 5. Instantly execute your API profile key hook configuration
    window.TapAI('init', {
      widget_id: 'd728acf0-5ba1-450a-8f89-14cc5da79339'
    });

    // Optional Clean up: Removes the script tag when component unmounts
    return () => {
      const existingScript = document.getElementById('tap-ai-widget-script');
      if (existingScript) existingScript.remove();
    };
  }, []);

  return null; // This component operates entirely in the background
}