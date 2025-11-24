import { useEffect, useState } from 'react';
import ControlPanel from './ControlPanel';
import RaceTrack from './RaceTrack';

function App() {
  const [isTicker, setIsTicker] = useState(false);

  useEffect(() => {
    const checkMode = () => {
      // SI la pantalla mide menos de 300px de alto (Tu pantalla Ticker)
      // O SI es más ancha que alta (Modo paisaje en PC)
      // ENTONCES mostramos la carrera.
      const isLandscape = window.innerWidth > window.innerHeight;
      const isShortHeight = window.innerHeight < 300;
      
      // Priorizamos la altura corta para detectar tu pantalla ticker
      setIsTicker(isLandscape || isShortHeight);
    };

    checkMode();
    window.addEventListener('resize', checkMode);
    return () => window.removeEventListener('resize', checkMode);
  }, []);

  return isTicker ? <RaceTrack /> : <ControlPanel />;
}

export default App;