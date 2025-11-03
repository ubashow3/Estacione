import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Vehicle, Settings, PaymentMethod } from '../types.ts';
import { ArrowLeftIcon } from './Icons.tsx';

// A biblioteca qrcode.js é carregada via CDN no index.html
declare const QRCode: any;

interface VehicleExitPageProps {
  vehicle: Vehicle;
  settings: Settings;
  onCompleteExit: (id: string, amountPaid: number, paymentMethod: PaymentMethod) => void;
  onBack: () => void;
}

type PaymentStep = 'select' | 'awaiting' | 'receipt';

// Funções para geração do payload PIX (com cálculo de CRC16 correto)
const generatePixPayload = (key: string, holder: string, city: string, amount: number, txid: string) => {
    const format = (id: string, value: string) => {
        const len = value.length.toString().padStart(2, '0');
        return `${id}${len}${value}`;
    };

    const sanitize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9\s]/g, '').trim();

    const holderSanitized = sanitize(holder).substring(0, 25);
    const citySanitized = sanitize(city).substring(0, 15);
    const amountFormatted = amount.toFixed(2);

    let payload = [
        format('00', '01'),
        format('26', `${format('00', 'br.gov.bcb.pix')}${format('01', key)}`),
        format('52', '0000'),
        format('53', '986'), // Real
        format('54', amountFormatted),
        format('58', 'BR'),
        format('59', holderSanitized),
        format('60', citySanitized),
        format('62', format('05', txid)),
    ].join('');

    payload += '6304';
    payload += crc16(payload);

    return payload;
};

const crc16 = (payload: string): string => {
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
        }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
};


const VehicleExitPage: React.FC<VehicleExitPageProps> = ({ vehicle, settings, onCompleteExit, onBack }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [paymentStep, setPaymentStep] = useState<PaymentStep>('select');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);

  const qrCodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { durationString, totalToPay } = useMemo(() => {
    const entry = new Date(vehicle.entryTime);
    const durationMs = currentTime.getTime() - entry.getTime();
    const totalMinutes = Math.max(1, Math.ceil(durationMs / 60000));
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const durationString = `${hours}h ${minutes}m`;

    let calculatedPay = 0;
    if (totalMinutes <= 60) {
      calculatedPay = settings.hourlyRate;
    } else {
      const fullHours = Math.floor(totalMinutes / 60);
      const remainingMinutes = totalMinutes % 60;

      if (remainingMinutes <= settings.toleranceMinutes) {
        calculatedPay = fullHours * settings.hourlyRate;
      } else if (remainingMinutes > settings.toleranceMinutes && remainingMinutes <= settings.fractionLimitMinutes) {
        calculatedPay = (fullHours * settings.hourlyRate) + settings.fractionRate;
      } else {
        calculatedPay = (fullHours + 1) * settings.hourlyRate;
      }
    }
    return { durationString, totalToPay: calculatedPay };
  }, [currentTime, vehicle.entryTime, settings]);
  
  const handlePaymentSelect = (method: PaymentMethod) => {
    setSelectedMethod(method);
    if (method === PaymentMethod.CONVENIO) {
        onCompleteExit(vehicle.id, 0, method);
        setPaymentStep('receipt');
    } else {
        setPaymentStep('awaiting');
    }
  };

  const handleConfirmation = () => {
    if (selectedMethod) {
        onCompleteExit(vehicle.id, totalToPay, selectedMethod);
        setPaymentStep('receipt');
    }
  };

  const cancelPayment = () => {
    setSelectedMethod(null);
    setPaymentStep('select');
  }

  // Efeito para gerar o QR Code
  useEffect(() => {
    if (paymentStep === 'awaiting' && selectedMethod === PaymentMethod.PIX && qrCodeRef.current) {
        qrCodeRef.current.innerHTML = ''; // Limpa QR code anterior
        const txid = vehicle.plate.replace(/[^A-Z0-9]/ig, '') + Date.now();
        const pixPayload = generatePixPayload(settings.pixKey, settings.pixHolderName, settings.pixHolderCity, totalToPay, txid);
        new QRCode(qrCodeRef.current, {
            text: pixPayload,
            width: 256,
            height: 256,
            correctLevel: QRCode.CorrectLevel.M
        });
    }
  }, [paymentStep, selectedMethod, settings, totalToPay, vehicle.plate]);
  
  // Efeito para o timeout do PIX
  useEffect(() => {
    if (paymentStep === 'awaiting' && selectedMethod === PaymentMethod.PIX) {
        const timerId = setTimeout(() => {
            handleConfirmation();
        }, 10000); // 10 segundos

        // Limpa o timer se o componente for desmontado ou as dependências mudarem (ex: usuário cancela)
        return () => clearTimeout(timerId); 
    }
  }, [paymentStep, selectedMethod]);


  const handlePrintReceipt = () => {
    const receiptContent = `
        <html>
            <head>
                <title>Cupom - Pare Aqui!!</title>
                <style>
                    body { font-family: 'Courier New', monospace; margin: 20px; font-size: 14px; color: #000; }
                    .container { width: 300px; margin: 0 auto; border: 1px solid #ccc; padding: 10px; }
                    h1 { text-align: center; margin: 0; font-size: 18px; }
                    p { margin: 5px 0; }
                    hr { border: none; border-top: 1px dashed black; margin: 10px 0; }
                    .item { display: flex; justify-content: space-between; }
                    .item span:first-child { font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Pare Aqui!!</h1>
                    <p style="text-align:center;">CNPJ: XX.XXX.XXX/0001-XX</p>
                    <hr />
                    <p style="text-align:center; font-weight: bold;">CUPOM NÃO FISCAL</p>
                    <hr />
                    <div class="item"><span>Placa:</span><span>${vehicle.plate}</span></div>
                    <div class="item"><span>Entrada:</span><span>${new Date(vehicle.entryTime).toLocaleString('pt-BR')}</span></div>
                    <div class="item"><span>Saída:</span><span>${currentTime.toLocaleString('pt-BR')}</span></div>
                    <div class="item"><span>Permanência:</span><span>${durationString}</span></div>
                    <hr />
                    <div class="item"><span>Valor Pago:</span><span>R$ ${(selectedMethod === PaymentMethod.CONVENIO ? 0 : totalToPay).toFixed(2).replace('.', ',')}</span></div>
                    <div class="item"><span>Pagamento:</span><span>${selectedMethod ? selectedMethod.charAt(0).toUpperCase() + selectedMethod.slice(1) : ''}</span></div>
                    <hr />
                    <p style="text-align:center;">Obrigado e volte sempre!</p>
                </div>
            </body>
        </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write(receiptContent);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    }
};

  const renderSelection = () => (
    <>
      <div className="text-center bg-slate-100 dark:bg-slate-900 dark:border dark:border-slate-700 rounded-lg p-6 mb-6">
        <p className="text-lg text-slate-700 dark:text-slate-300 font-medium">Valor a Pagar</p>
        <p className="text-5xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">R$ {totalToPay.toFixed(2).replace('.', ',')}</p>
      </div>
      <div className="mb-6">
        <p className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-3 text-center">Forma de Pagamento</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button onClick={() => handlePaymentSelect(PaymentMethod.PIX)} className="p-4 rounded-lg font-semibold border-2 text-slate-700 border-slate-300 bg-white hover:border-blue-500 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700 dark:hover:border-slate-500">PIX</button>
            <button onClick={() => handlePaymentSelect(PaymentMethod.CASH)} className="p-4 rounded-lg font-semibold border-2 text-slate-700 border-slate-300 bg-white hover:border-blue-500 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700 dark:hover:border-slate-500">Dinheiro</button>
            <button onClick={() => handlePaymentSelect(PaymentMethod.CARD)} className="p-4 rounded-lg font-semibold border-2 text-slate-700 border-slate-300 bg-white hover:border-blue-500 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700 dark:hover:border-slate-500">Cartão</button>
            <button onClick={() => handlePaymentSelect(PaymentMethod.CONVENIO)} className="p-4 rounded-lg font-semibold border-2 text-slate-700 border-slate-300 bg-white hover:border-blue-500 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-700 dark:hover:border-slate-500">Convênio</button>
        </div>
      </div>
    </>
  );

  const renderAwaiting = () => {
    const pixPayload = generatePixPayload(settings.pixKey, settings.pixHolderName, settings.pixHolderCity, totalToPay, vehicle.plate.replace(/[^A-Z0-9]/ig, '') + Date.now());
    
    return (
        <div className="text-center">
            {selectedMethod === PaymentMethod.PIX && (
                <>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Pagar com PIX</h3>
                    <p className="text-slate-600 dark:text-slate-400 mb-4">Escaneie o QR Code com o app do seu banco.</p>
                    <div ref={qrCodeRef} className="flex justify-center mb-4 p-2 bg-white border rounded-lg"></div>
                    <div className="mb-4">
                        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-1">Ou copie o código:</p>
                        <input type="text" readOnly value={pixPayload} className="w-full text-center bg-slate-100 dark:bg-slate-700 dark:text-slate-300 p-2 border dark:border-slate-600 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-slate-500" onClick={(e) => (e.target as HTMLInputElement).select()} />
                    </div>
                </>
            )}
            {selectedMethod === PaymentMethod.CARD && (
                <>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Pagamento com Cartão</h3>
                    <p className="text-slate-600 dark:text-slate-400 mb-4">Insira o cartão na maquininha e aguarde a aprovação.</p>
                </>
            )}
            {selectedMethod === PaymentMethod.CASH && (
                <>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Pagamento em Dinheiro</h3>
                    <p className="text-slate-600 dark:text-slate-400 mb-4">Aguardando recebimento do valor em espécie.</p>
                </>
            )}
            
            <p className="text-lg font-semibold text-slate-600 dark:text-slate-300 my-6 flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-slate-500 dark:text-slate-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {selectedMethod === PaymentMethod.PIX || selectedMethod === PaymentMethod.CARD ? 'Aguardando confirmação bancária...' : 'Aguardando confirmação do atendente.'}
            </p>
             
             <div className="flex flex-col sm:flex-row gap-3">
                {selectedMethod !== PaymentMethod.PIX && (
                  <button onClick={handleConfirmation} className="w-full sm:flex-1 bg-green-600 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:bg-green-700">
                    {selectedMethod === PaymentMethod.CASH ? 'Confirmar Recebimento' : 'Confirmar Pagamento'}
                  </button>
                )}
                <button onClick={cancelPayment} className={`w-full ${selectedMethod !== PaymentMethod.PIX ? 'sm:flex-1' : ''} bg-slate-500 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:bg-slate-600`}>
                  Cancelar
                </button>
             </div>
        </div>
    )
  };

  const renderReceipt = () => (
    <div className="text-center">
        <h3 className="text-2xl font-bold text-green-600 mb-4">Pagamento Confirmado!</h3>
        <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg space-y-2 text-left mb-6 text-slate-800 dark:text-slate-200">
            <p><strong>Placa:</strong> <span className="font-mono">{vehicle.plate}</span></p>
            <p><strong>Valor Pago:</strong> R$ {(selectedMethod === PaymentMethod.CONVENIO ? 0 : totalToPay).toFixed(2).replace('.', ',')}</p>
            <p><strong>Forma de Pagamento:</strong> <span className="capitalize">{selectedMethod}</span></p>
            <p><strong>Entrada:</strong> {new Date(vehicle.entryTime).toLocaleString('pt-BR')}</p>
            <p><strong>Saída:</strong> {currentTime.toLocaleString('pt-BR')}</p>
        </div>
        
        <div className="mt-6 pt-6 border-t dark:border-slate-600">
            <p className="text-slate-600 dark:text-slate-300 mb-4">Deseja imprimir o cupom fiscal?</p>
            <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={handlePrintReceipt} className="w-full sm:flex-1 bg-slate-600 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:bg-slate-700">
                  Imprimir Cupom
                </button>
                <button onClick={onBack} className="w-full sm:flex-1 bg-blue-600 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:bg-blue-700 dark:bg-slate-600 dark:hover:bg-slate-500">
                  Finalizar
                </button>
            </div>
        </div>
    </div>
  );
  
  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-md max-w-2xl mx-auto">
        <div className="flex items-center mb-6">
            <button onClick={paymentStep === 'select' ? onBack : cancelPayment} className="mr-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700">
                <ArrowLeftIcon className="h-6 w-6 text-slate-600 dark:text-slate-300" />
            </button>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Registrar Saída</h2>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg mb-6">
            <p className="font-mono text-3xl font-bold text-slate-800 dark:text-slate-100 text-center mb-2">{vehicle.plate}</p>
            <p className="text-md text-slate-600 dark:text-slate-400 text-center mb-4">{vehicle.brand} - {vehicle.color}</p>
            
            <div className="grid grid-cols-3 gap-4 text-center pt-4 border-t border-slate-200 dark:border-slate-700">
                <div><p className="text-sm text-slate-500 dark:text-slate-400">Entrada</p><p className="font-semibold text-lg text-slate-800 dark:text-slate-200">{new Date(vehicle.entryTime).toLocaleTimeString()}</p></div>
                <div><p className="text-sm text-slate-500 dark:text-slate-400">Saída</p><p className="font-semibold text-lg text-slate-800 dark:text-slate-200">{currentTime.toLocaleTimeString()}</p></div>
                <div><p className="text-sm text-slate-500 dark:text-slate-400">Permanência</p><p className="font-semibold text-lg text-slate-800 dark:text-slate-200">{durationString}</p></div>
            </div>
        </div>
        
        {paymentStep === 'select' && renderSelection()}
        {paymentStep === 'awaiting' && renderAwaiting()}
        {paymentStep === 'receipt' && renderReceipt()}
    </div>
  );
};

export default VehicleExitPage;