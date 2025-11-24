import { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { ref, push, set, onValue } from 'firebase/database';

export default function ControlPanel() {
  // --- ESTADOS ---
  const [myCarId, setMyCarId] = useState<string | null>(null);
  const [name, setName] = useState('');
  
  // ESTADOS DE EDICIÓN (VARITA MÁGICA)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [tolerance, setTolerance] = useState(30); // Fuerza de la varita
  const [history, setHistory] = useState<ImageData[]>([]); // Para Deshacer
  
  // ESTADOS MINIJUEGO
  const [gameActive, setGameActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(5);
  const [clicks, setClicks] = useState(0);
  const [gameFinished, setGameFinished] = useState(false);
  const [loading, setLoading] = useState(false);

  // ESCUCHAR FIN DE CARRERA
  useEffect(() => {
    if (!myCarId) return;
    const activeRaceRef = ref(db, 'active_race');
    const unsubscribe = onValue(activeRaceRef, (snapshot) => {
      if (!snapshot.exists()) setTimeout(() => resetForm(), 4000);
    });
    return () => unsubscribe();
  }, [myCarId]);

  const resetForm = () => {
    setMyCarId(null); setName(''); setOriginalImage(null);
    setHistory([]); setLoading(false);
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

  const startGame = () => { if (!gameFinished) { setClicks(0); setTimeLeft(5); setGameActive(true); } };
  const handleClick = (e: any) => { if(e.cancelable) e.preventDefault(); if (gameActive) setClicks(p => p + 1); };

  // --- LOGICA DE IMAGEN ---
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            setOriginalImage(img);
            setHistory([]); // Limpiar historial
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  // Inicializar Canvas
  useEffect(() => {
    if (originalImage && canvasRef.current && history.length === 0) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        const displayWidth = 350;
        const scale = displayWidth / originalImage.width;
        canvas.width = displayWidth;
        canvas.height = originalImage.height * scale;

        ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
        // Guardar estado inicial
        setHistory([ctx.getImageData(0, 0, canvas.width, canvas.height)]);
    }
  }, [originalImage]);

  // --- ALGORITMO DE VARITA MÁGICA (FLOOD FILL) ---
  const magicWand = (startX: number, startY: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return;

    // 1. Obtener píxeles
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data; // Array gigante [R, G, B, A, R, G, B, A...]
    
    const width = canvas.width;
    const height = canvas.height;

    // 2. Color objetivo (donde hiciste click)
    const startPos = (startY * width + startX) * 4;
    const targetR = data[startPos];
    const targetG = data[startPos + 1];
    const targetB = data[startPos + 2];
    const targetA = data[startPos + 3];

    if (targetA === 0) return; // Ya es transparente, no hacer nada

    // 3. Algoritmo de Búsqueda (BFS - Breadth First Search)
    // Usamos una pila para no recursar y matar la memoria
    const pixelStack = [[startX, startY]];
    const visited = new Uint8Array(width * height); // Mapa de visitados para no repetir

    const matchColor = (pos: number) => {
        const r = data[pos];
        const g = data[pos + 1];
        const b = data[pos + 2];
        const a = data[pos + 3];
        
        // Calcular distancia de color
        const diff = Math.abs(r - targetR) + Math.abs(g - targetG) + Math.abs(b - targetB);
        return (diff <= tolerance * 3 && a !== 0); // Multiplicamos tolerancia para sensibilidad
    };

    while (pixelStack.length) {
        const newPos = pixelStack.pop();
        if(!newPos) continue;
        const x = newPos[0];
        const y = newPos[1];

        const pixelPos = (y * width + x) * 4;
        const visitPos = y * width + x;

        if (visited[visitPos]) continue; // Ya revisado

        if (matchColor(pixelPos)) {
            // BORRAR PÍXEL (Alpha = 0)
            data[pixelPos + 3] = 0; 
            visited[visitPos] = 1;

            // Agregar vecinos a la pila
            if (x > 0) pixelStack.push([x - 1, y]);
            if (x < width - 1) pixelStack.push([x + 1, y]);
            if (y > 0) pixelStack.push([x, y - 1]);
            if (y < height - 1) pixelStack.push([x, y + 1]);
        }
    }

    // 4. Aplicar cambios y guardar historial
    ctx.putImageData(imageData, 0, 0);
    
    // Guardar para Undo (Limitamos a 5 pasos para memoria)
    setHistory(prev => [...prev.slice(-4), imageData]);
  };

  const handleCanvasTouch = (e: React.MouseEvent | React.TouchEvent) => {
      if (!canvasRef.current) return;
      // Prevenir comportamientos default
      if (e.type === 'touchstart') {
         // No preventDefault aquí para permitir scroll si tocan fuera, 
         // pero idealmente el canvas debería tener touch-action: none
      }

      const rect = canvasRef.current.getBoundingClientRect();
      let clientX, clientY;

      if ('touches' in e) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
      } else {
          clientX = (e as React.MouseEvent).clientX;
          clientY = (e as React.MouseEvent).clientY;
      }

      const x = Math.floor(clientX - rect.left);
      const y = Math.floor(clientY - rect.top);

      // Ejecutar Varita
      // Usamos setTimeout para que la UI no se congele antes de mostrar el feedback
      setTimeout(() => magicWand(x, y), 10);
  };

  const undo = () => {
      if (history.length <= 1 || !canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      // Volver al estado anterior
      const newHistory = [...history];
      newHistory.pop(); // Quitar el actual
      const previousState = newHistory[newHistory.length - 1];
      
      ctx.putImageData(previousState, 0, 0);
      setHistory(newHistory);
  };

  // 5. ENVIAR
  const handleSubmit = async () => {
    if (!name || !gameFinished || !canvasRef.current) return alert("¡Termina todo primero!");
    setLoading(true);
    try {
      const finalImage = canvasRef.current.toDataURL('image/png');
      const waitingRef = ref(db, 'waiting_room');
      const newCarRef = push(waitingRef);
      const newId = newCarRef.key;
      setMyCarId(newId);

      await set(newCarRef, {
        id: newId,
        name: name.toUpperCase().substring(0, 12),
        level: '1',
        clicks: clicks,
        image: finalImage,
        timestamp: Date.now()
      });
    } catch (error) { console.error(error); setLoading(false); }
  };

  // --- VISTAS ---

  if (myCarId) {
      return (
        <div className="fixed inset-0 bg-neutral-900 z-50 flex flex-col items-center justify-center p-6 text-center">
            <div className="text-8xl mb-6 animate-bounce">🏎️</div>
            <h1 className="text-orange-500 font-black text-4xl mb-4">LISTO</h1>
            <p className="text-white text-xl">Tu auto espera en la pista.</p>
            <div className="mt-8 p-4 bg-gray-800 rounded-xl border border-orange-500">
                <p className="text-gray-400 text-sm">POTENCIA</p>
                <p className="text-yellow-400 text-4xl font-mono font-bold">{clicks} Clicks</p>
            </div>
        </div>
      );
  }

  if (gameActive) {
    return (
      <div className="fixed inset-0 bg-red-600 z-50 flex flex-col items-center justify-center touch-none select-none overflow-hidden"
           onMouseDown={handleClick} onTouchStart={handleClick}>
         <h2 className="text-yellow-300 font-black text-[12vw] animate-bounce mb-4 uppercase text-center leading-none">¡DALE!</h2>
         <div className="bg-white text-red-600 rounded-full w-[60vw] h-[60vw] flex items-center justify-center shadow-2xl active:scale-90 transition-transform">
            <span className="text-[20vw] font-black">{clicks}</span>
         </div>
         <p className="text-white mt-8 font-mono text-4xl font-bold">{timeLeft}s</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-neutral-900 flex flex-col w-full h-full font-sans">
      <div className="flex-none bg-neutral-900 p-3 text-center border-b border-gray-800 z-10">
        <h1 className="text-2xl font-black text-orange-600 italic tracking-tighter transform -skew-x-6">TALLER MÁGICO</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5 w-full max-w-md mx-auto">
        
        {/* 1. NOMBRE */}
        <div>
          <label className="text-xs font-bold text-orange-500 uppercase ml-1 mb-1 block">1. PILOTO</label>
          <input 
            value={name} onChange={e => setName(e.target.value)}
            className="w-full p-3 bg-neutral-800 rounded-lg text-white font-bold text-lg outline-none border-2 border-transparent focus:border-orange-600"
            placeholder="Tu nombre" maxLength={10}
          />
        </div>

        {/* 2. FOTO Y VARITA MÁGICA */}
        <div className="flex flex-col">
          <div className="flex justify-between items-center mb-1">
             <label className="text-xs font-bold text-orange-500 uppercase block">2. VARITA MÁGICA 🪄</label>
             {originalImage && (
                 <button onClick={undo} className="text-xs bg-neutral-700 px-2 py-1 rounded text-white active:bg-neutral-600">
                    ↩ Deshacer
                 </button>
             )}
          </div>
          
          {!originalImage ? (
            <label className="flex h-40 flex-col items-center justify-center w-full border-2 border-neutral-700 border-dashed rounded-xl bg-neutral-800/50 active:bg-neutral-800 transition-colors">
               <span className="text-3xl mb-1">📸</span>
               <span className="text-sm text-gray-400 font-bold uppercase">Subir Foto</span>
               <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </label>
          ) : (
            <div className="flex flex-col gap-2 items-center">
               {/* SLIDER DE TOLERANCIA */}
               <div className="w-full flex items-center gap-2 bg-neutral-800 p-2 rounded-lg">
                  <span className="text-xs text-gray-400">Tolerancia:</span>
                  <input 
                    type="range" min="5" max="100" 
                    value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))}
                    className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                  <span className="text-xs font-mono text-white w-6">{tolerance}</span>
               </div>

               {/* CANVAS */}
               <div className="relative border-2 border-orange-500/50 rounded-lg overflow-hidden bg-[url('https://www.transparenttextures.com/patterns/checkerboard.png')]">
                  <canvas 
                    ref={canvasRef}
                    onMouseDown={handleCanvasTouch} // Para PC
                    onTouchStart={handleCanvasTouch} // Para Movil
                    className="cursor-crosshair touch-none"
                  />
                  <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded pointer-events-none">
                    🪄 Toca el fondo para borrarlo
                  </div>
               </div>

               <button onClick={() => setOriginalImage(null)} className="w-full py-2 bg-red-900/30 text-red-400 rounded-lg font-bold text-sm mt-1 border border-red-900/50">
                 🗑️ Cambiar Foto
               </button>
            </div>
          )}
        </div>

        {/* 3. MOTOR */}
        <div className="pb-20">
           <label className="text-xs font-bold text-orange-500 uppercase ml-1 mb-1 block">3. MOTOR</label>
           {!gameFinished ? (
               <button onClick={startGame} className="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl font-black text-xl shadow-lg active:scale-95 text-white">
                  AFINAR MOTOR ⚡
               </button>
           ) : (
               <div className="w-full bg-green-900/30 border border-green-600 rounded-xl p-3 flex items-center justify-between">
                   <span className="text-green-400 text-xs font-bold uppercase">Potencia:</span>
                   <span className="text-white font-black text-2xl">{clicks} CLICKS</span>
                   <button onClick={() => { setGameFinished(false); setClicks(0); }} className="text-gray-400 text-xs underline">↺</button>
               </div>
           )}
        </div>
      </div>

      <div className="flex-none p-4 bg-neutral-900 border-t border-gray-800 z-20">
        <button onClick={handleSubmit} disabled={loading || !name || !gameFinished}
          className={`w-full py-4 rounded-xl font-black text-xl tracking-wide shadow-lg transition-all ${loading || !name || !gameFinished ? 'bg-neutral-800 text-gray-600' : 'bg-orange-600 text-white active:scale-[0.98]'}`}>
          {loading ? 'ENVIANDO...' : '🏁 A LA PISTA'}
        </button>
      </div>
    </div>
  );
}