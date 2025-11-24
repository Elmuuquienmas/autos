import { useState, useEffect } from 'react';
import { db } from './firebase';
import { ref, push, set } from 'firebase/database';

export default function ControlPanel() {
  const [name, setName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [flipImage, setFlipImage] = useState(false);
  const [loading, setLoading] = useState(false);

  // Minijuego
  const [gameActive, setGameActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(5);
  const [clicks, setClicks] = useState(0);
  const [finalLevel, setFinalLevel] = useState<'1' | '2' | '3' | null>(null);

  useEffect(() => {
    let interval: number;
    if (gameActive && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft((p) => p - 1), 1000);
    } else if (timeLeft === 0 && gameActive) {
      setGameActive(false);
      calculateLevel();
    }
    return () => clearInterval(interval);
  }, [gameActive, timeLeft]);

  const startGame = () => {
    if (finalLevel) return;
    setClicks(0);
    setTimeLeft(5);
    setGameActive(true);
  };

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    // Previene zoom y scroll mientras clickeas como loco
    if(e.cancelable) e.preventDefault(); 
    if (gameActive) setClicks(prev => prev + 1);
  };

  const calculateLevel = () => {
    if (clicks < 15) setFinalLevel('1');
    else if (clicks < 30) setFinalLevel('2');
    else setFinalLevel('3');
  };

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
          if (flipImage) {
             ctx.translate(canvas.width, 0);
             ctx.scale(-1, 1);
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        }
        resolve(canvas.toDataURL('image/png', 0.8));
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !selectedFile || !finalLevel) return alert("¡Faltan datos!");
    setLoading(true);
    try {
      const imageBase64 = await processImage(selectedFile);
      const newCarRef = push(ref(db, 'waiting_room'));
      await set(newCarRef, {
        name: name.toUpperCase().substring(0, 12),
        level: finalLevel,
        clicks: clicks, // <--- AHORA GUARDAMOS LOS CLICKS PARA LA TABLA
        image: imageBase64,
        timestamp: Date.now()
      });
      alert("¡AUTO ENVIADO!");
      setName(''); setSelectedFile(null); setPreview(null);
      setFinalLevel(null); setClicks(0); setFlipImage(false);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-neutral-900 text-white font-sans w-full overflow-x-hidden flex flex-col items-center">
      
      {/* HEADER */}
      <div className="w-full bg-neutral-900 pt-6 pb-2 px-4 text-center z-10">
        <h1 className="text-3xl font-black text-orange-600 italic tracking-tighter">
          TALLER RACING
        </h1>
      </div>

      <div className="w-full max-w-md px-5 pb-10 flex flex-col gap-5 flex-grow">
        
        {/* PASO 1 */}
        <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 w-full">
          <label className="text-xs font-bold text-orange-500 uppercase block mb-1">1. Piloto</label>
          <input 
            value={name} onChange={e => setName(e.target.value)}
            className="w-full p-3 bg-neutral-900 rounded-lg border border-neutral-600 text-white font-bold text-lg"
            placeholder="Nombre"
            maxLength={12}
          />
        </div>

        {/* PASO 2 */}
        <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 w-full">
          <label className="text-xs font-bold text-orange-500 uppercase block mb-2">2. Foto</label>
          <label className="flex flex-col items-center justify-center w-full h-16 border-2 border-neutral-600 border-dashed rounded-lg bg-neutral-900">
             <span className="text-sm text-gray-400 font-bold">📸 Tocar para subir</span>
             <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          </label>
          {preview && (
            <div className="mt-4 bg-black/30 p-2 rounded border border-neutral-700">
              <div className="relative w-full h-32 flex justify-center overflow-hidden">
                 <img src={preview} className={`h-full w-auto object-contain transition-transform duration-300 ${flipImage ? 'scale-x-[-1]' : ''}`} />
              </div>
              <button type="button" onClick={() => setFlipImage(!flipImage)} className="w-full mt-2 py-2 bg-neutral-700 rounded text-xs font-bold uppercase">
                🔄 Voltear Dirección
              </button>
            </div>
          )}
        </div>

        {/* PASO 3 - MINIJUEGO */}
        <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 w-full relative">
          <label className="text-xs font-bold text-orange-500 uppercase block mb-2">3. Potencia</label>
          
          {!finalLevel ? (
             !gameActive ? (
                <button 
                  type="button" onClick={startGame}
                  className="w-full py-5 bg-blue-600 rounded-lg font-black text-lg shadow-lg active:scale-95 transition-transform"
                >
                  AFINAR MOTOR
                  <span className="block text-[10px] font-normal opacity-80 mt-1">Clickea rápido 5 segundos</span>
                </button>
             ) : (
                // --- BOTÓN FULL SCREEN (MODO INMERSIVO) ---
                <div className="fixed inset-0 z-50 bg-red-600 flex flex-col items-center justify-center touch-none select-none"
                     onMouseDown={handleClick} onTouchStart={handleClick}>
                   <h1 className="text-white text-6xl font-black mb-4 animate-bounce">¡DALE!</h1>
                   <div className="text-[20vh] font-mono font-bold text-yellow-300 leading-none">{clicks}</div>
                   <div className="mt-10 text-white text-xl font-bold uppercase tracking-widest">Tiempo: {timeLeft}s</div>
                   <p className="absolute bottom-10 text-white/50 text-sm">Toca cualquier parte de la pantalla</p>
                </div>
             )
          ) : (
            <div className="text-center bg-green-900/30 border border-green-500/50 rounded-lg p-3">
               <div className="text-green-400 text-xs font-bold uppercase">Motor Listo</div>
               <div className="text-3xl font-black text-white">NIVEL {finalLevel}</div>
               <div className="text-gray-400 text-xs">({clicks} clicks)</div>
               <button onClick={() => setFinalLevel(null)} className="text-xs text-gray-500 underline mt-2 p-2">Reintentar</button>
            </div>
          )}
        </div>

        <button 
          onClick={handleSubmit}
          disabled={loading || !finalLevel || !selectedFile}
          className={`w-full py-4 rounded-xl font-black text-xl shadow-xl transition-all ${
            loading || !finalLevel || !selectedFile ? 'bg-neutral-700 text-gray-500 opacity-50' : 'bg-gradient-to-r from-orange-600 to-red-600 text-white'
          }`}
        >
          {loading ? 'ENVIANDO...' : '🏁 IR A LA PISTA'}
        </button>

      </div>
    </div>
  );
}