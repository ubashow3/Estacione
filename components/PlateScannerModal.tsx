import React, { useState, useRef, useEffect, useCallback } from 'react';
import { XIcon } from './Icons';

// Tesseract é carregado a partir de um script CDN no index.html
// FIX: Added proper type declarations for the Tesseract.js library loaded via CDN.
// This resolves the "Cannot find namespace 'Tesseract'" error and provides type safety.
declare namespace Tesseract {
  interface Worker {
    recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string } }>;
    setParameters: (params: object) => Promise<void>;
    terminate: () => Promise<void>;
  }
  interface LoggerMessage {
    status: string;
    progress: number;
  }
}

declare const Tesseract: {
  createWorker: (
    lang: string,
    oem: number,
    options: { logger: (m: Tesseract.LoggerMessage) => void }
  ) => Promise<Tesseract.Worker>;
};

interface PlateScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlateScanned: (plate: string) => void;
}

const PlateScannerModal: React.FC<PlateScannerModalProps> = ({ isOpen, onClose, onPlateScanned }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Tesseract.Worker | null>(null);

  const [status, setStatus] = useState('Aguardando câmera...');
  const [progress, setProgress] = useState(0);
  const [recognizedText, setRecognizedText] = useState('');
  const [isInitializing, setIsInitializing] = useState(true);

  // Função para inicializar o Tesseract worker
  const initializeWorker = useCallback(async () => {
    setIsInitializing(true);
    if (workerRef.current === null) {
      setStatus('Carregando modelo de OCR...');
      const worker = await Tesseract.createWorker('por', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            setProgress(m.progress);
          }
        },
      });
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
      });
      workerRef.current = worker;
    }
    setStatus('Modelo carregado.');
    setIsInitializing(false);
  }, []);

  // Função para limpar os recursos da câmera
  const cleanupCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  // Efeito para configurar a câmera e o worker
  useEffect(() => {
    if (isOpen) {
      initializeWorker();
    } else {
      cleanupCamera();
    }
  }, [isOpen, initializeWorker, cleanupCamera]);
  
  // Efeito para encerrar o worker ao desmontar
  useEffect(() => {
    return () => {
        workerRef.current?.terminate();
        workerRef.current = null;
    }
  }, []);

  // Efeito para iniciar a câmera após o worker ser inicializado
  useEffect(() => {
    if (isOpen && !isInitializing) {
      startCamera();
    }
  }, [isOpen, isInitializing]);

  const startCamera = async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        setStatus('Iniciando câmera...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setStatus('Câmera pronta. Posicione a placa.');
        }
      } catch (error) {
        console.error("Erro ao acessar a câmera: ", error);
        setStatus('Erro ao acessar câmera. Verifique permissões.');
      }
    } else {
      setStatus('Seu navegador não suporta acesso à câmera.');
    }
  };
  
  const captureAndRecognize = useCallback(async () => {
    if (!workerRef.current || !videoRef.current || !canvasRef.current || status.includes('Analisando')) return;

    setStatus('Analisando imagem...');
    setProgress(0);
    setRecognizedText('');
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      
      const { data: { text } } = await workerRef.current.recognize(canvas);
      const cleanedText = text.replace(/[^A-Z0-9-]/gi, '').toUpperCase().trim();
      
      setRecognizedText(cleanedText);
      setStatus('Reconhecimento concluído. Verifique a placa.');
      setProgress(1);
    }
  }, [status]);

  const handleUsePlate = () => {
    if (recognizedText) {
      onPlateScanned(recognizedText);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-4 sm:p-6 w-full max-w-lg flex flex-col max-h-full">
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-xl font-bold text-slate-800">Escanear Placa</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XIcon className="h-6 w-6" />
          </button>
        </div>
        
        <div className="relative w-full aspect-video bg-black rounded overflow-hidden mb-4">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline></video>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10/12 h-1/2 border-4 border-dashed border-yellow-400 opacity-75 rounded-md"></div>
          </div>
          <canvas ref={canvasRef} className="hidden"></canvas>
        </div>

        <div className="bg-slate-100 p-3 rounded-md text-center mb-4 flex-shrink-0">
          <p className="text-sm font-semibold text-slate-700 h-5">{status}</p>
          {(status.includes('Analisando') || status.includes('Carregando')) && (
            <div className="w-full bg-slate-200 rounded-full h-2.5 mt-2">
              <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress * 100}%` }}></div>
            </div>
          )}
          {recognizedText && (
            <p className="text-2xl font-mono tracking-widest bg-white p-2 mt-2 rounded border border-slate-300">{recognizedText}</p>
          )}
        </div>
        
        <div className="mt-auto grid grid-cols-1 sm:grid-cols-2 gap-4 flex-shrink-0">
          <button
            onClick={captureAndRecognize}
            disabled={isInitializing || status.includes('Analisando')}
            className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-md shadow-sm hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
          >
            Capturar Imagem
          </button>
          <button
            onClick={handleUsePlate}
            disabled={!recognizedText}
            className="w-full bg-green-600 text-white font-semibold py-3 px-4 rounded-md shadow-sm hover:bg-green-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
          >
            Usar Placa Reconhecida
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlateScannerModal;