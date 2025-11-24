import { useState, useEffect } from 'react';
import { db } from './firebase';
import { ref, push, set, onValue } from 'firebase/database';

export default function ControlPanel() {
  // ESTADOS FORMULARIO
  const [myCarId, setMyCarId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [flipImage, setFlipImage] = useState(false);
  const [loading, setLoading] = useState(false);

  // ESTADOS MINIJUEGO
  const [gameActive, setGameActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(5);
  const [clicks, setClicks] = useState(0);
  const [gameFinished, setGameFinished] = useState(false);

  // ESCUCHAR ESTADO DE CARRERA (Para saber cuándo resetearse)
  useEffect(() => {
    if (!myCarId) return; // Solo escuchamos si ya enviamos el auto

    const activeRaceRef = ref(db, 'active_race');
    const unsubscribe = onValue(activeRaceRef, (snapshot) => {
      // Si active_race se vuelve null (la carrera terminó), nos reseteamos
      if (snapshot.exists()) {
          // Estamos corriendo...
      } else {
          // La carrera terminó o no existe.
          // Si yo ya había enviado mi auto (tengo ID) y ya no hay carrera, me reseteo.
          // Pequeño timeout para dejar ver el resultado en la pantalla grande
          setTimeout(() => {
             resetForm();
          }, 2000);
      }
    });
    return () => unsubscribe();
  }, [myCarId]);

  const resetForm = () => {
    setMyCarId(null); setName(''); setSelectedFile(null);
    setPreview(null); setFlipImage(false); setLoading(false);
    setClicks(0); setGameFinished(false); setTimeLeft(5);
  };

  // LOGICA MINIJUEGO
  useEffect(() => {
    let interval: number;
    if (gameActive && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft((p) => p - 1), 1000);
    } else if (timeLeft === 0 && gameActive) {
      setGameActive(false);
      setGameFinished(true);
    }
    return () => clearInterval(interval);
  }, [gameActive, timeLeft]);

  const startGame = () => {
    if (gameFinished) return;
    setClicks(0); setTimeLeft(5); setGameActive(true);
  };

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    if (gameActive) setClicks(p => p + 1);
  };

  // LOGICA IMAGEN
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const processImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400;
        const scale = MAX_WIDTH / img.width; 
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if(ctx) {
          ctx.save();
          if (flipImage) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        }
        resolve(canvas.toDataURL('image/png', 0.8));
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !selectedFile || !gameFinished) return alert("¡Termina el minijuego y llena datos!");
    setLoading(true);
    try {
      const imageBase64 = await processImage(selectedFile);
      const waitingRef = ref(db, 'waiting_room');
      const newCarRef = push(waitingRef);
      const newId = newCarRef.key;
      setMyCarId(newId); // Marca que ya estamos dentro

      await set(newCarRef, {
        id: newId,
        name: name.toUpperCase().substring(0, 12),
        level: '1',
        clicks: clicks, // Mandamos los clicks iniciales
        image: imageBase64,
        timestamp: Date.now()
      });
    } catch (error) { console.error(error); setLoading(false); }
  };

  // --- VISTAS ---

  // 1. MODO ESPECTADOR (Cuando ya envié mi auto)
  if (myCarId) {
      return (
        <div className="fixed inset-0 bg-neutral-900 z-50 flex flex-col items-center justify-center p-6 text-center">
            <div className="text-8xl mb-6 animate-pulse">👀</div>
            <h1 className="text-orange-500 font-black text-4xl mb-4">ENVIADO</h1>
            <p className="text-white text-xl">Tu auto está en la pantalla grande.</p>
            <div className="mt-8 p-4 bg-gray-800 rounded-xl">
                <p className="text-gray-400 text-sm">POTENCIA GENERADA</p>
                <p className="text-yellow-400 text-4xl font-mono font-bold">{clicks} Clicks</p>
            </div>
            <p className="text-gray-500 text-xs mt-10">Tu celular se reiniciará al acabar la carrera.</p>
        </div>
      );
  }

  // 2. MODO JUEGO ACTIVO (PANTALLA ROJA)
  if (gameActive) {
    return (
      <div className="fixed inset-0 bg-red-600 z-50 flex flex-col items-center justify-center touch-none select-none overflow-hidden"
           onMouseDown={handleClick} onTouchStart={handleClick}>
         <h2 className="text-yellow-300 font-black text-[8vw] animate-bounce mb-4 uppercase text-center px-2 leading-none">
           ¡DALE GAS!
         </h2>
         <p className="text-white font-bold text-lg mb-8 animate-pulse">TOCA LA PANTALLA RÁPIDO</p>
         <div className="bg-white text-red-600 rounded-full w-[50vw] h-[50vw] max-w-[250px] max-h-[250px] flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.5)] active:scale-90 transition-transform">
            <span className="text-[15vw] font-black">{clicks}</span>
         </div>
         <p className="text-white mt-8 font-mono text-2xl font-bold">{timeLeft}s</p>
      </div>
    );
  }

  // 3. FORMULARIO NORMAL
  return (
    <div className="fixed inset-0 bg-neutral-900 flex flex-col w-full h-full font-sans">
      <div className="flex-none bg-neutral-900 p-4 pb-2 text-center border-b border-gray-800 z-10 shadow-md">
        <h1 className="text-3xl font-black text-orange-600 italic tracking-tighter transform -skew-x-6">TALLER RACING</h1>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 flex flex-col gap-6 w-full max-w-lg mx-auto">
        
        {/* NOMBRE */}
        <div className="w-full">
          <label className="text-xs font-bold text-orange-500 uppercase ml-1 mb-1 block">1. PILOTO</label>
          <input 
            value={name} onChange={e => setName(e.target.value)}
            className="w-full p-4 bg-neutral-800 rounded-xl text-white font-bold text-xl outline-none border-2 border-transparent focus:border-orange-600 transition-colors placeholder-gray-600"
            placeholder="Tu nombre..."
            maxLength={12}
          />
        </div>

        {/* FOTO */}
        <div className="w-full">
          <label className="text-xs font-bold text-orange-500 uppercase ml-1 mb-1 block">2. VEHÍCULO</label>
          {!preview ? (
            <label className="flex min-h-[150px] flex-col items-center justify-center w-full border-2 border-neutral-700 border-dashed rounded-xl bg-neutral-800/50 hover:bg-neutral-800 transition-colors">
               <span className="text-4xl mb-2">📸</span>
               <span className="text-sm text-gray-400 font-bold uppercase">Subir Foto</span>
               <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </label>
          ) : (
            <div className="w-full flex flex-col gap-3">
               <div className="relative w-full h-[200px] bg-black/40 rounded-xl overflow-hidden border border-neutral-700">
                  <img src={preview} className={`w-full h-full object-contain transition-transform duration-300 ${flipImage ? 'scale-x-[-1]' : ''}`} />
                  <button onClick={() => { setSelectedFile(null); setPreview(null); }} className="absolute top-2 right-2 bg-red-600 text-white rounded-full w-8 h-8 font-bold flex items-center justify-center z-20">✕</button>
               </div>
               <button type="button" onClick={() => setFlipImage(!flipImage)} className="w-full py-3 bg-neutral-800 rounded-xl font-bold text-gray-300 border border-neutral-700">🔄 Voltear</button>
            </div>
          )}
        </div>

        {/* POTENCIA (MINIJUEGO) */}
        <div className="w-full pb-20">
           <label className="text-xs font-bold text-orange-500 uppercase ml-1 mb-1 block">3. MOTOR</label>
           {!gameFinished ? (
               <button 
                  type="button" onClick={startGame}
                  className="w-full py-5 bg-blue-600 rounded-xl font-black text-xl shadow-lg active:scale-95 transition-transform text-white flex flex-col items-center justify-center gap-1">
                  <span>AFINAR MOTOR ⚡</span>
                  <span className="text-xs font-normal opacity-80">Minijuego de 5 segundos</span>
               </button>
           ) : (
               <div className="w-full bg-green-900/30 border border-green-600 rounded-xl p-4 flex items-center justify-between">
                   <div>
                       <div className="text-green-400 text-xs font-bold uppercase">Potencia Lista</div>
                       <div className="text-white font-black text-2xl">{clicks} CLICKS</div>
                   </div>
                   <button onClick={() => { setGameFinished(false); setClicks(0); }} className="text-gray-400 text-xs underline">Repetir</button>
               </div>
           )}
        </div>
      </div>

      <div className="flex-none p-5 bg-neutral-900 border-t border-gray-800 w-full max-w-lg mx-auto z-20">
        <button 
          onClick={handleSubmit}
          disabled={loading || !name || !selectedFile || !gameFinished}
          className={`w-full py-5 rounded-2xl font-black text-xl tracking-wide shadow-lg transition-all ${loading || !name || !selectedFile || !gameFinished ? 'bg-neutral-800 text-gray-600' : 'bg-gradient-to-r from-orange-600 to-red-600 text-white active:scale-[0.98]'}`}
        >
          {loading ? 'ENVIANDO...' : '🏁 ENTRAR A PISTA'}
        </button>
      </div>
    </div>
  );
}