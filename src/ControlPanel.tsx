import { useState, useEffect } from 'react';
import { db } from './firebase';
import { ref, push, set } from 'firebase/database';

export default function ControlPanel() {
  // --- ESTADOS ---
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

  // --- LÓGICA DEL JUEGO (CLICKS) ---
  useEffect(() => {
    let interval: number;
    if (gameActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
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
    // Prevenir el zoom o comportamientos raros en móvil
    if(e.cancelable) e.preventDefault(); 
    if (gameActive) setClicks(prev => prev + 1);
  };

  const calculateLevel = () => {
    // Ajusté un poco los clicks para que sea desafiante pero lograble
    if (clicks < 15) setFinalLevel('1'); // Stock
    else if (clicks < 30) setFinalLevel('2'); // Turbo
    else setFinalLevel('3'); // Nitro
  };

  // --- LÓGICA DE IMAGEN (CANVAS PURO) ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  // Esta función ahora solo redimensiona y voltea (NO quita fondo)
  const processImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Reducimos a 400px de ancho para que no pese en Firebase
        const MAX_WIDTH = 400;
        const scale = MAX_WIDTH / img.width; 
        
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scale;
        
        const ctx = canvas.getContext('2d');
        if(ctx) {
          ctx.save();
          if (flipImage) {
             // Magia para voltear horizontalmente
             ctx.translate(canvas.width, 0);
             ctx.scale(-1, 1);
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        }
        // Retornamos Base64 comprimido (0.8 calidad)
        resolve(canvas.toDataURL('image/png', 0.8));
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !selectedFile || !finalLevel) return alert("¡Te falta información!");

    setLoading(true);
    
    try {
      // Procesamos la imagen (Resize + Flip)
      const imageBase64 = await processImage(selectedFile);

      // Enviamos a Firebase
      const newCarRef = push(ref(db, 'waiting_room'));
      await set(newCarRef, {
        name: name.toUpperCase().substring(0, 12), // Limitamos nombre
        level: finalLevel,
        image: imageBase64,
        timestamp: Date.now()
      });

      alert("¡AUTO ENVIADO!");
      
      // Resetear formulario
      setName('');
      setSelectedFile(null);
      setPreview(null);
      setFinalLevel(null);
      setClicks(0);
      setFlipImage(false);

    } catch (error) {
      console.error(error);
      alert("Error al subir.");
    } finally {
      setLoading(false);
    }
  };

  // --- INTERFAZ RESPONSIVA ---
  return (
    <div className="min-h-screen bg-neutral-900 text-white font-sans w-full overflow-x-hidden">
      {/* Contenedor principal centrado y con ancho máximo seguro */}
      <div className="w-full max-w-lg mx-auto px-4 py-6 flex flex-col gap-6">
        
        {/* TITULO */}
        <div className="text-center">
          <h1 className="text-4xl font-black text-orange-600 italic tracking-tighter transform -skew-x-12">
            TALLER RACING
          </h1>
          <p className="text-gray-400 text-sm mt-1">Sube tu nave y compite</p>
        </div>

        {/* 1. NOMBRE */}
        <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 shadow-lg w-full">
          <label className="text-xs font-bold text-orange-500 uppercase mb-1 block">1. Piloto</label>
          <input 
            value={name} onChange={e => setName(e.target.value)}
            className="w-full p-3 bg-neutral-900 rounded-lg border border-neutral-600 focus:border-orange-500 outline-none text-white font-bold text-lg"
            placeholder="Tu Nombre"
            maxLength={12}
          />
        </div>

        {/* 2. FOTO Y POSICIÓN */}
        <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 shadow-lg w-full">
          <label className="text-xs font-bold text-orange-500 uppercase mb-2 block">2. Foto del Auto</label>
          
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleFileChange}
            className="w-full mb-4 text-sm text-gray-400 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-orange-600 file:text-white file:font-bold block"
          />

          {preview && (
            <div className="flex flex-col gap-3 bg-neutral-900 p-3 rounded-lg">
              <p className="text-xs text-center text-gray-500">¿Hacia dónde mira el frente?</p>
              
              {/* Vista Previa Visual */}
              <div className="relative w-full h-32 flex justify-center overflow-hidden border border-dashed border-gray-600 rounded bg-black/40">
                 <img 
                    src={preview} 
                    className={`h-full w-auto object-contain transition-transform duration-300 ${flipImage ? 'scale-x-[-1]' : ''}`} 
                    alt="Vista previa"
                 />
                 {/* Flecha indicadora de dirección */}
                 <div className="absolute bottom-2 right-2 text-2xl animate-pulse">➡️</div>
              </div>

              <button 
                type="button"
                onClick={() => setFlipImage(!flipImage)}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-bold transition-all w-full ${flipImage ? 'bg-orange-600 text-white' : 'bg-neutral-700 text-gray-300'}`}
              >
                🔄 {flipImage ? 'VOLTEADO' : 'VOLTEAR IMAGEN'}
              </button>
            </div>
          )}
        </div>

        {/* 3. MINIJUEGO */}
        <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 shadow-lg text-center relative w-full">
          <label className="text-xs font-bold text-orange-500 uppercase mb-2 block">3. Potencia</label>

          {!finalLevel ? (
             !gameActive ? (
                <button 
                  type="button"
                  onClick={startGame}
                  className="w-full py-6 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-lg font-black text-xl hover:scale-[1.02] transition-transform shadow-lg active:scale-95"
                >
                  AFINAR MOTOR
                  <span className="block text-xs font-normal opacity-80 mt-1">¡Clickea rápido 5 seg!</span>
                </button>
             ) : (
                <div className="space-y-2 select-none">
                   <div className="text-4xl font-mono font-bold text-yellow-400">{timeLeft.toFixed(0)}s</div>
                   <button 
                     type="button"
                     onMouseDown={handleClick} // PC
                     onTouchStart={handleClick} // Móvil (más rápido)
                     className="w-full py-8 bg-red-600 active:bg-red-500 rounded-xl font-black text-2xl shadow-inner touch-manipulation transform active:scale-[0.98] transition-all"
                   >
                     ¡CLICK AQUÍ! ({clicks})
                   </button>
                </div>
             )
          ) : (
            <div className="bg-green-900/40 border border-green-500 rounded-lg p-4 animate-fadeIn">
               <h3 className="text-green-400 font-bold uppercase text-xs tracking-widest">Resultado</h3>
               <div className="text-5xl font-black text-white mt-2">NIVEL {finalLevel}</div>
               <p className="text-sm text-gray-400 mt-1">Lograste {clicks} clicks</p>
               <button onClick={() => setFinalLevel(null)} className="text-xs text-orange-400 underline mt-3 p-2">
                 Intentar de nuevo
               </button>
            </div>
          )}
        </div>

        {/* BOTÓN ENVIAR */}
        <button 
          onClick={handleSubmit}
          disabled={loading || !finalLevel || !selectedFile}
          className={`w-full py-5 rounded-xl font-black text-xl shadow-2xl transition-all mb-8 ${
            loading || !finalLevel || !selectedFile 
              ? 'bg-neutral-700 text-gray-500 cursor-not-allowed opacity-50' 
              : 'bg-gradient-to-r from-orange-600 to-red-600 text-white active:scale-95'
          }`}
        >
          {loading ? 'SUBIENDO...' : 'ENVIAR A PISTA 🏁'}
        </button>

      </div>
    </div>
  );
}