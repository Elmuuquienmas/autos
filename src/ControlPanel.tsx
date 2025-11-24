import { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { ref, push, set } from 'firebase/database';
import { removeBackground } from "@imgly/background-removal";

export default function ControlPanel() {
  // ESTADOS DEL FORMULARIO
  const [name, setName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [flipImage, setFlipImage] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  // ESTADOS DEL MINIJUEGO (TUNING)
  const [gameActive, setGameActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(5);
  const [clicks, setClicks] = useState(0);
  const [finalLevel, setFinalLevel] = useState<'1' | '2' | '3' | null>(null);
  
  // LOGICA DEL MINIJUEGO
  useEffect(() => {
    let interval: number;
    if (gameActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && gameActive) {
      // FIN DEL JUEGO
      setGameActive(false);
      calculateLevel();
    }
    return () => clearInterval(interval);
  }, [gameActive, timeLeft]);

  const startGame = () => {
    if (finalLevel) return; // Si ya jugó, no reiniciar
    setClicks(0);
    setTimeLeft(5);
    setGameActive(true);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (gameActive) setClicks(prev => prev + 1);
  };

  const calculateLevel = () => {
    // UMBRALES DE DIFICULTAD
    // Nivel 1: 0-20 clicks (4 clicks/seg)
    // Nivel 2: 21-35 clicks (7 clicks/seg)
    // Nivel 3: 36+ clicks (>7 clicks/seg - Modo Dios)
    if (clicks < 20) setFinalLevel('1');
    else if (clicks < 35) setFinalLevel('2');
    else setFinalLevel('3');
  };

  // LOGICA DE PROCESAMIENTO DE IMAGEN
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      // Previsualización simple local
      setPreview(URL.createObjectURL(file));
    }
  };

  const processImage = async (file: File): Promise<string> => {
    setStatus('🔧 Redimensionando y Orientando...');
    
    // 1. Redimensionar y Voltear (Canvas)
    const resizedBlob = await new Promise<Blob>((resolve) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Reducimos tamaño para ayudar a la IA (max width 400px)
        const scale = 400 / img.width; 
        canvas.width = 400;
        canvas.height = img.height * scale;
        
        const ctx = canvas.getContext('2d');
        if(ctx) {
          if (flipImage) {
            // Lógica de espejo
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
        canvas.toBlob((blob) => resolve(blob!), 'image/png');
      };
    });

    setStatus('✨ La IA está quitando el fondo...');
    
    // 2. Quitar fondo con @imgly
    const blobNoBg = await removeBackground(resizedBlob, {
      publicPath: 'https://static.imgly.com/lib/background-removal-data/'
    });

    setStatus('📦 Empaquetando auto...');

    // 3. Convertir a Base64 final
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(blobNoBg);
      reader.onloadend = () => resolve(reader.result as string);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !selectedFile || !finalLevel) return alert("¡Completa todos los pasos!");

    setLoading(true);
    
    try {
      const imageBase64 = await processImage(selectedFile);

      setStatus('🚀 Enviando a la pista...');
      const newCarRef = push(ref(db, 'waiting_room'));
      await set(newCarRef, {
        name: name.toUpperCase(),
        level: finalLevel,
        image: imageBase64,
        timestamp: Date.now()
      });

      alert("¡AUTO ENVIADO CON ÉXITO!");
      // Resetear todo
      setName('');
      setSelectedFile(null);
      setPreview(null);
      setFinalLevel(null);
      setClicks(0);
    } catch (error) {
      console.error(error);
      alert("Error procesando la imagen. Intenta con otra foto.");
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  // --- INTERFAZ ---
  return (
    <div className="min-h-screen bg-neutral-900 text-white font-sans overflow-x-hidden">
      <div className="max-w-md mx-auto p-4 pb-12 flex flex-col gap-6">
        
        {/* CABECERA */}
        <div className="text-center mt-4">
          <h1 className="text-4xl font-black text-orange-600 italic tracking-tighter transform -skew-x-12">
            TALLER RACING
          </h1>
          <p className="text-gray-400 text-sm mt-1">Prepara tu máquina para la carrera</p>
        </div>

        {/* PASO 1: DATOS */}
        <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 shadow-lg">
          <label className="text-xs font-bold text-orange-500 uppercase mb-1 block">1. Licencia de Piloto</label>
          <input 
            value={name} onChange={e => setName(e.target.value)}
            className="w-full p-3 bg-neutral-900 rounded-lg border border-neutral-600 focus:border-orange-500 outline-none text-white font-bold text-lg placeholder-gray-600"
            placeholder="Tu Nombre o Apodo"
            maxLength={12}
          />
        </div>

        {/* PASO 2: CARROCERÍA (FOTO) */}
        <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 shadow-lg">
          <label className="text-xs font-bold text-orange-500 uppercase mb-2 block">2. Carrocería y Pintura</label>
          
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleFileChange}
            className="w-full mb-4 text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-orange-600 file:text-white file:font-bold"
          />

          {preview && (
            <div className="flex flex-col items-center gap-3 bg-neutral-900 p-4 rounded-lg">
              <p className="text-xs text-gray-500">Vista Previa (¿Hacia dónde mira?)</p>
              
              {/* Imagen con transformación CSS para previsualizar el flip */}
              <div className="relative w-full h-32 flex justify-center overflow-hidden border border-dashed border-gray-600 rounded">
                 <img 
                    src={preview} 
                    className={`h-full w-auto object-contain transition-transform duration-300 ${flipImage ? 'scale-x-[-1]' : ''}`} 
                    alt="Vista previa"
                 />
              </div>

              <button 
                type="button"
                onClick={() => setFlipImage(!flipImage)}
                className="flex items-center gap-2 bg-neutral-700 hover:bg-neutral-600 px-4 py-2 rounded text-sm font-bold transition-colors w-full justify-center"
              >
                🔄 Voltear / Espejo
              </button>
            </div>
          )}
        </div>

        {/* PASO 3: MINIJUEGO DE MOTOR */}
        <div className="bg-neutral-800 p-4 rounded-xl border border-neutral-700 shadow-lg text-center relative overflow-hidden">
          <label className="text-xs font-bold text-orange-500 uppercase mb-2 block">3. Tuning de Motor</label>

          {!finalLevel ? (
             !gameActive ? (
                <button 
                  type="button"
                  onClick={startGame}
                  className="w-full py-6 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-lg font-black text-xl hover:scale-105 transition-transform shadow-[0_0_15px_rgba(0,191,255,0.5)]"
                >
                  INICIAR AFINACIÓN
                  <span className="block text-xs font-normal opacity-80 mt-1">Tienes 5 seg para clickear rápido</span>
                </button>
             ) : (
                <div className="space-y-2">
                   <div className="text-4xl font-mono font-bold text-yellow-400">{timeLeft.toFixed(1)}s</div>
                   <button 
                     type="button"
                     onMouseDown={handleClick} // Mejor respuesta en PC
                     onTouchStart={handleClick} // Mejor respuesta en Movil
                     className="w-full py-8 bg-red-600 active:bg-red-700 active:scale-95 rounded-xl font-black text-3xl shadow-inner select-none touch-manipulation transition-all"
                   >
                     ¡DALE CLICK! ({clicks})
                   </button>
                   <p className="text-xs text-gray-400">¡Más clicks = Más potencia!</p>
                </div>
             )
          ) : (
            <div className="bg-green-900/30 border border-green-500 rounded-lg p-4">
               <h3 className="text-green-400 font-bold uppercase text-sm">Motor Instalado</h3>
               <div className="text-4xl font-black text-white mt-1">NIVEL {finalLevel}</div>
               <p className="text-xs text-gray-400 mt-1">Score: {clicks} clicks</p>
               <button onClick={() => setFinalLevel(null)} className="text-xs text-gray-500 underline mt-2">Reintentar</button>
            </div>
          )}
        </div>

        {/* BOTÓN FINAL */}
        <button 
          onClick={handleSubmit}
          disabled={loading || !finalLevel || !selectedFile}
          className={`w-full py-5 rounded-xl font-black text-xl shadow-2xl transform transition-all ${
            loading || !finalLevel || !selectedFile 
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
              : 'bg-gradient-to-r from-orange-600 to-red-600 text-white hover:scale-105 shadow-[0_0_20px_rgba(255,69,0,0.5)]'
          }`}
        >
          {loading ? (
             <span className="animate-pulse">{status || 'PROCESANDO...'}</span>
          ) : 'ENVIAR A PISTA 🏁'}
        </button>

        <div className="h-8"></div> {/* Espacio extra abajo para scrolls */}
      </div>
    </div>
  );
}