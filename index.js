// Substitua pela sua chave de acesso REAL do Mercado Pago
const MERCADO_PAGO_ACCESS_TOKEN = "APP_USR-64e7edb3-81a0-4d68-b516-9b0467649fec"; 

import { db } from './firebase.js';

let state = {
    vehicles: [],
    settings: {
        hourlyRate: 10,
        toleranceMinutes: 5,
        fractionRate: 5,
        fractionLimitMinutes: 15,
        pixKey: "seu-pix@email.com",
        pixHolderName: "NOME DO TITULAR",
        pixHolderCity: "CIDADE"
    },
    currentPage: 'operational', // operational, reports, admin, checkout-selection, checkout-pix, checkout-standard, checkout-success
    selectedVehicleId: null,
    paymentData: null,
    theme: localStorage.getItem('theme') || 'dark',
};

// --- HELPERS ---
const formatCurrency = (value) => value ? `R$ ${parseFloat(value).toFixed(2).replace('.', ',')}` : 'R$ 0,00';
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};
const applyTheme = () => {
    if (state.theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', state.theme);
}

// --- CORE LOGIC ---
const calculateParkingFee = (entryTime, exitTime) => {
    const entry = new Date(entryTime);
    const exit = new Date(exitTime);
    const diffMs = exit - entry;
    const diffMins = Math.ceil(diffMs / (1000 * 60));

    if (diffMins <= state.settings.toleranceMinutes) {
        return 0;
    }
    if (diffMins <= state.settings.fractionLimitMinutes) {
        return state.settings.fractionRate;
    }
    const diffHours = Math.ceil(diffMins / 60);
    return diffHours * state.settings.hourlyRate;
};

// --- RENDER FUNCTIONS ---
const renderHeader = () => {
    const isDark = state.theme === 'dark';
    return `
        <header class="flex flex-col items-center md:flex-row md:justify-between mb-6 space-y-4 md:space-y-0">
            <h1 class="text-3xl font-bold text-sky-500">Pare Aqui!!</h1>
            <div class="flex items-center space-x-4">
                <nav class="flex space-x-2 bg-slate-200 dark:bg-slate-800 p-1 rounded-full">
                    <button data-action="navigate" data-page="operational" class="${state.currentPage === 'operational' ? 'bg-sky-500 text-white' : ''} px-3 py-1 rounded-full text-sm font-semibold transition-colors">Operacional</button>
                    <button data-action="navigate" data-page="reports" class="${state.currentPage === 'reports' ? 'bg-sky-500 text-white' : ''} px-3 py-1 rounded-full text-sm font-semibold transition-colors">Relatórios</button>
                    <button data-action="navigate" data-page="admin" class="${state.currentPage === 'admin' ? 'bg-sky-500 text-white' : ''} px-3 py-1 rounded-full text-sm font-semibold transition-colors">Configurações</button>
                </nav>
                <button data-action="toggle-theme" class="p-2 rounded-full bg-slate-200 dark:bg-slate-800">
                    ${isDark ? 
                        `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>` : 
                        `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM4.95 14.536a1 1 0 001.414 1.414l.707-.707a1 1 0 00-1.414-1.414l-.707-.707zm10.607-2.12a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM4.95 5.464a1 1 0 001.414-1.414l.707.707a1 1 0 00-1.414 1.414l-.707-.707z" clip-rule="evenodd" /></svg>` 
                    }
                </button>
            </div>
        </header>
    `;
};

const renderOperationalPage = () => {
    const parkedVehicles = state.vehicles.filter(v => v.status === 'parked').sort((a, b) => new Date(b.entryTime) - new Date(a.entryTime));
    const vehicleList = parkedVehicles.length > 0 ? parkedVehicles.map(v => `
        <li class="flex items-center justify-between p-3 bg-slate-200 dark:bg-slate-800 rounded-lg border-l-4 border-sky-500 dark:border-sky-500">
            <div>
                <p class="font-mono text-lg font-bold">${v.plate}</p>
                <p class="text-sm text-slate-600 dark:text-slate-400">${v.brand} - ${v.color}</p>
                <p class="text-sm text-slate-600 dark:text-slate-400">Entrada: ${formatDate(v.entryTime)}</p>
            </div>
            <button data-action="start-exit-vehicle" data-id="${v.id}" class="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">Registrar Saída</button>
        </li>
    `).join('') : '<p class="text-center text-slate-500 dark:text-slate-400 py-4">Pátio vazio.</p>';

    const brands = ["Fiat", "Chevrolet", "Volkswagen", "Ford", "Renault", "Hyundai", "Toyota", "Honda", "Jeep", "Nissan", "Citroën", "Peugeot", "Mitsubishi", "Caoa Chery", "BMW", "Mercedes-Benz", "Audi", "Kia", "Land Rover", "Volvo"];
    const colors = ["Preto", "Branco", "Prata", "Cinza", "Vermelho", "Azul", "Marrom", "Verde", "Amarelo", "Dourado", "Laranja", "Roxo"];

    return `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="md:col-span-1 bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
                <h2 class="text-xl font-bold mb-4">Registrar Entrada</h2>
                <form id="add-vehicle-form" class="space-y-4">
                    <div class="relative">
                        <label for="plate" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Placa</label>
                        <div class="flex items-center">
                            <input type="text" id="plate" name="plate" required class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:ring-sky-500 focus:border-sky-500" placeholder="ABC-1234">
                            <button type="button" data-action="open-scanner" class="ml-2 p-2 rounded-md bg-sky-500 text-white hover:bg-sky-600">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586l-.707-.707A2 2 0 0012.414 4H7.586a2 2 0 00-1.293.293L5.586 5H4zm6 8a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" /></svg>
                            </button>
                        </div>
                    </div>
                    <div>
                        <label for="brand" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Marca</label>
                        <select id="brand" name="brand" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-sm shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500">
                            ${brands.map(b => `<option value="${b}">${b}</option>`).join('')}
                        </select>
                    </div>
                     <div>
                        <label for="color" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Cor</label>
                        <select id="color" name="color" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-sm shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500">
                             ${colors.map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    <button type="submit" data-action="add-vehicle" class="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">Adicionar Veículo</button>
                </form>
            </div>
            <div class="md:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
                <h2 class="text-xl font-bold mb-4">Veículos no Pátio (${parkedVehicles.length})</h2>
                <ul class="space-y-3 max-h-96 overflow-y-auto pr-2">${vehicleList}</ul>
            </div>
        </div>
        <div id="modal-container"></div>
    `;
};

const renderReportsPage = () => {
    const paidVehicles = state.vehicles.filter(v => v.status === 'paid').sort((a, b) => new Date(b.exitTime) - new Date(a.exitTime));
    const totalRevenue = paidVehicles.filter(v => v.paymentMethod !== 'convenio').reduce((acc, v) => acc + (v.amountPaid || 0), 0);
    const vehicleList = paidVehicles.length > 0 ? paidVehicles.map(v => `
        <tr class="border-b border-slate-200 dark:border-slate-700">
            <td class="p-3 font-mono">${v.plate}</td>
            <td class="p-3">${formatDate(v.entryTime)}</td>
            <td class="p-3">${formatDate(v.exitTime)}</td>
            <td class="p-3 capitalize">${v.paymentMethod || 'N/A'}</td>
            <td class="p-3 text-right font-semibold">${formatCurrency(v.amountPaid)}</td>
        </tr>
    `).join('') : '<tr><td colspan="5" class="text-center p-4 text-slate-500 dark:text-slate-400">Nenhum registro de saída.</td></tr>';

    return `
        <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
            <h2 class="text-2xl font-bold mb-4">Relatórios de Faturamento</h2>
            <div class="mb-6 p-4 bg-sky-100 dark:bg-sky-900/50 rounded-lg">
                <p class="text-lg text-slate-600 dark:text-slate-300">Faturamento Total (exceto convênio):</p>
                <p class="text-4xl font-bold text-sky-600 dark:text-sky-400">${formatCurrency(totalRevenue)}</p>
            </div>
            <h3 class="text-xl font-bold mb-2">Histórico de Saídas</h3>
            <div class="overflow-x-auto">
                <table class="w-full text-left">
                    <thead class="bg-slate-100 dark:bg-slate-700 text-sm uppercase">
                        <tr>
                            <th class="p-3">Placa</th>
                            <th class="p-3">Entrada</th>
                            <th class="p-3">Saída</th>
                            <th class="p-3">Pagamento</th>
                            <th class="p-3 text-right">Valor Pago</th>
                        </tr>
                    </thead>
                    <tbody>${vehicleList}</tbody>
                </table>
            </div>
        </div>
    `;
};

const renderAdminPage = () => {
    const { settings } = state;
    return `
        <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
            <h2 class="text-2xl font-bold mb-4">Configurações do Sistema</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <h3 class="text-lg font-semibold mb-2">Precificação</h3>
                    <div class="space-y-4">
                        <div>
                            <label for="hourlyRate" class="block text-sm font-medium">Valor da Hora (R$)</label>
                            <input type="number" id="hourlyRate" data-setting="hourlyRate" value="${settings.hourlyRate}" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md">
                        </div>
                        <div>
                            <label for="toleranceMinutes" class="block text-sm font-medium">Minutos de Tolerância</label>
                            <input type="number" id="toleranceMinutes" data-setting="toleranceMinutes" value="${settings.toleranceMinutes}" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md">
                        </div>
                         <div>
                            <label for="fractionRate" class="block text-sm font-medium">Valor da Fração (R$)</label>
                            <input type="number" id="fractionRate" data-setting="fractionRate" value="${settings.fractionRate}" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md">
                        </div>
                        <div>
                            <label for="fractionLimitMinutes" class="block text-sm font-medium">Limite da Fração (minutos)</label>
                            <input type="number" id="fractionLimitMinutes" data-setting="fractionLimitMinutes" value="${settings.fractionLimitMinutes}" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md">
                        </div>
                    </div>
                </div>
                 <div>
                    <h3 class="text-lg font-semibold mb-2">Configurações PIX</h3>
                    <div class="space-y-4">
                        <div>
                            <label for="pixKey" class="block text-sm font-medium">Chave PIX</label>
                            <input type="text" id="pixKey" data-setting="pixKey" value="${settings.pixKey}" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md">
                        </div>
                        <div>
                            <label for="pixHolderName" class="block text-sm font-medium">Nome do Titular</label>
                            <input type="text" id="pixHolderName" data-setting="pixHolderName" value="${settings.pixHolderName}" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md">
                        </div>
                         <div>
                            <label for="pixHolderCity" class="block text-sm font-medium">Cidade do Titular</label>
                            <input type="text" id="pixHolderCity" data-setting="pixHolderCity" value="${settings.pixHolderCity}" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md">
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
};

const renderCheckoutSelectionPage = () => {
    const vehicle = state.vehicles.find(v => v.id === state.selectedVehicleId);
    if (!vehicle) {
        state.currentPage = 'operational';
        return renderApp();
    }

    const exitTime = new Date();
    const amount = calculateParkingFee(vehicle.entryTime, exitTime);
    const entry = new Date(vehicle.entryTime);
    const diffMs = exitTime - entry;
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const minutes = diffMins % 60;
    const permanence = `${hours}h ${minutes}min`;

    state.paymentData = { vehicle, exitTime: exitTime.toISOString(), amount, permanence };

    return `
       <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg max-w-lg mx-auto">
            <div class="flex justify-between items-start">
                <h2 class="text-2xl font-bold mb-4">Registrar Saída</h2>
                <button data-action="navigate" data-page="operational" class="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">&times;</button>
            </div>
            <div class="mb-4 p-4 bg-slate-100 dark:bg-slate-700 rounded-lg">
                <p><strong>Placa:</strong> ${vehicle.plate}</p>
                <p><strong>Permanência:</strong> ${permanence}</p>
                <p class="text-2xl font-bold mt-2">Total a Pagar: ${formatCurrency(amount)}</p>
            </div>
            <h3 class="text-lg font-semibold mb-3">Selecione a Forma de Pagamento:</h3>
            <div class="grid grid-cols-2 gap-4">
                <button data-action="select-payment-method" data-method="pix" class="p-4 bg-sky-500 text-white rounded-lg font-semibold text-center hover:bg-sky-600 transition-colors">PIX</button>
                <button data-action="select-payment-method" data-method="dinheiro" class="p-4 bg-green-500 text-white rounded-lg font-semibold text-center hover:bg-green-600 transition-colors">Dinheiro</button>
                <button data-action="select-payment-method" data-method="cartao" class="p-4 bg-orange-500 text-white rounded-lg font-semibold text-center hover:bg-orange-600 transition-colors">Cartão</button>
                <button data-action="select-payment-method" data-method="convenio" class="p-4 bg-slate-500 text-white rounded-lg font-semibold text-center hover:bg-slate-600 transition-colors">Convênio</button>
            </div>
        </div>
    `;
}

const renderPixPaymentPage = () => {
    const { vehicle, amount, permanence } = state.paymentData;
    return `
        <div id="pix-payment-page" class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg max-w-lg mx-auto text-center">
            <h2 class="text-2xl font-bold mb-2">Pagamento com PIX</h2>
            <p class="mb-4">Total: <span class="font-bold text-lg">${formatCurrency(amount)}</span></p>
            <div id="qrcode-container" class="flex justify-center my-4">
                 <div class="loader"></div>
                 <p class="mt-2">Gerando QR Code...</p>
            </div>
            <p id="pix-status" class="font-semibold text-lg text-yellow-500">Aguardando Pagamento...</p>
            <p class="text-sm text-slate-500 mt-2">Escaneie o QR Code com o app do seu banco.</p>
            <button data-action="cancel-payment" class="mt-6 w-full bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500 font-bold py-2 px-4 rounded-lg transition-colors">
                Cancelar / Trocar Método
            </button>
        </div>
    `;
};

const renderStandardPaymentPage = (method) => {
    const { vehicle, amount, permanence } = state.paymentData;
    const methodColors = {
        dinheiro: "bg-green-500 hover:bg-green-600",
        cartao: "bg-orange-500 hover:bg-orange-600",
        convenio: "bg-slate-500 hover:bg-slate-600"
    };

    return `
         <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg max-w-lg mx-auto">
            <h2 class="text-2xl font-bold mb-2">Confirmar Pagamento</h2>
            <div class="mb-4 p-4 bg-slate-100 dark:bg-slate-700 rounded-lg">
                <p><strong>Placa:</strong> ${vehicle.plate}</p>
                <p><strong>Permanência:</strong> ${permanence}</p>
                <p class="text-2xl font-bold mt-2">Total a Pagar: ${formatCurrency(amount)}</p>
                <p class="mt-2"><strong>Método:</strong> <span class="capitalize font-semibold">${method}</span></p>
            </div>
             <button data-action="confirm-payment" data-method="${method}" class="w-full text-white font-bold py-3 px-4 rounded-lg transition-colors text-lg ${methodColors[method]}">
                Confirmar Saída e Registrar Pagamento
            </button>
            <button data-action="cancel-payment" class="mt-4 w-full bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500 font-bold py-2 px-4 rounded-lg transition-colors">
                Trocar Método
            </button>
        </div>
    `;
};

const renderSuccessPage = () => {
    const { vehicle, amount, exitTime, permanence, paymentMethod } = state.paymentData;
    return `
        <div id="receipt-container" class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg max-w-md mx-auto text-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-green-500 mx-auto mb-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            <h2 class="text-2xl font-bold mb-2">Pagamento Aprovado!</h2>
            <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">Seu recibo está sendo preparado para impressão.</p>
            <div class="text-left my-6 space-y-2 p-4 border-t border-b border-dashed border-slate-300 dark:border-slate-600">
                 <h3 class="text-center font-bold text-lg mb-4">CUPOM NÃO FISCAL</h3>
                 <p><strong>Placa:</strong> <span class="font-mono float-right">${vehicle.plate}</span></p>
                 <p><strong>Entrada:</strong> <span class="font-mono float-right">${formatDate(vehicle.entryTime)}</span></p>
                 <p><strong>Saída:</strong> <span class="font-mono float-right">${formatDate(exitTime)}</span></p>
                 <p><strong>Permanência:</strong> <span class="font-mono float-right">${permanence}</span></p>
                 <p><strong>Pagamento:</strong> <span class="font-mono float-right capitalize">${paymentMethod}</span></p>
                 <p class="text-xl font-bold mt-4"><strong>TOTAL PAGO:</strong> <span class="font-mono float-right">${formatCurrency(amount)}</span></p>
            </div>
            <button id="print-button" data-action="print-receipt" class="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded-lg transition-colors mb-2">Imprimir Cupom</button>
            <button data-action="navigate" data-page="operational" class="w-full bg-slate-500 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">Voltar ao Pátio</button>
        </div>
    `;
}

const renderScannerModal = () => {
    return `
        <div id="scanner-modal" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div class="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-xl w-full max-w-lg">
                <div class="flex justify-between items-center mb-2">
                    <h3 class="text-lg font-bold">Escanear Placa</h3>
                    <button data-action="close-modal">&times;</button>
                </div>
                <div class="relative w-full aspect-video bg-black rounded-md overflow-hidden">
                    <video id="scanner-video" class="w-full h-full" autoplay playsinline></video>
                    <div class="absolute inset-0 flex items-center justify-center p-4">
                        <div class="w-full h-1/3 border-4 border-dashed border-red-500 opacity-75"></div>
                    </div>
                </div>
                <p id="scanner-status" class="text-center mt-2 text-sm">Aponte a câmera para a placa...</p>
            </div>
        </div>
    `;
};


let renderApp = () => {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    let content = '';
    switch (state.currentPage) {
        case 'operational':
            content = renderOperationalPage();
            break;
        case 'reports':
            content = renderReportsPage();
            break;
        case 'admin':
            content = renderAdminPage();
            break;
        case 'checkout-selection':
            content = renderCheckoutSelectionPage();
            break;
        case 'checkout-pix':
            content = renderPixPaymentPage();
            break;
        case 'checkout-standard':
            content = renderStandardPaymentPage(state.paymentData.paymentMethod);
            break;
        case 'checkout-success':
            content = renderSuccessPage();
            break;
        default:
            content = renderOperationalPage();
    }
    appEl.innerHTML = renderHeader() + content;
};


// --- EVENT HANDLERS & ACTIONS ---
let pixPollingInterval = null;
const handleAppClick = (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const page = target.dataset.page;
    const id = target.dataset.id;
    const method = target.dataset.method;

    switch (action) {
        case 'navigate':
            state.currentPage = page;
            renderApp();
            break;
        case 'toggle-theme':
            state.theme = state.theme === 'dark' ? 'light' : 'dark';
            applyTheme();
            renderApp();
            break;
        case 'add-vehicle':
            e.preventDefault();
            const form = document.getElementById('add-vehicle-form');
            const plate = form.plate.value.toUpperCase().trim();
            const brand = form.brand.value;
            const color = form.color.value;

            if (plate) {
                const newVehicle = {
                    id: `v_${Date.now()}`,
                    plate,
                    brand,
                    color,
                    entryTime: new Date().toISOString(),
                    status: 'parked'
                };
                db.ref('vehicles').push(newVehicle);
                form.reset();
            }
            break;
        case 'start-exit-vehicle':
            state.selectedVehicleId = id;
            state.currentPage = 'checkout-selection';
            renderApp();
            break;
        case 'select-payment-method':
            state.paymentData.paymentMethod = method;
            if (method === 'pix') {
                state.currentPage = 'checkout-pix';
                renderApp();
                startPixPayment();
            } else {
                state.currentPage = 'checkout-standard';
                renderApp();
            }
            break;
        case 'cancel-payment':
            clearInterval(pixPollingInterval);
            state.currentPage = 'checkout-selection';
            renderApp();
            break;
        case 'confirm-payment':
            if (state.paymentData) {
                finishPayment(method);
            }
            break;
        case 'print-receipt':
             window.print();
             break;
        case 'open-scanner':
            e.preventDefault();
            document.getElementById('modal-container').innerHTML = renderScannerModal();
            startScanner();
            break;
        case 'close-modal':
            stopScanner();
            document.getElementById('modal-container').innerHTML = '';
            break;
    }
};

const handleSettingsChange = debounce((e) => {
    const target = e.target.closest('[data-setting]');
    if (target) {
        const key = target.dataset.setting;
        const value = target.type === 'number' ? parseFloat(target.value) : target.value;
        db.ref('settings').child(key).set(value);
    }
}, 500);

const finishPayment = (paymentMethod) => {
    const { vehicle, exitTime, amount } = state.paymentData;
    const vehicleUpdates = {
        status: 'paid',
        exitTime: exitTime,
        amountPaid: amount,
        paymentMethod: paymentMethod
    };

    const dbKey = state.vehicles.find(v => v.id === vehicle.id).__dbKey;
    if (dbKey) {
        db.ref('vehicles').child(dbKey).update(vehicleUpdates).then(() => {
            state.currentPage = 'checkout-success';
            renderApp();
            // Aciona a impressão automaticamente após renderizar a tela de sucesso
            setTimeout(() => {
                window.print();
            }, 500); 
        });
    }
};

// --- MERCADO PAGO PIX ---
const startPixPayment = async () => {
    if (MERCADO_PAGO_ACCESS_TOKEN === "SEU_ACCESS_TOKEN_DO_MЕРСАDO_PAGO_AQUI") {
        document.getElementById('qrcode-container').innerHTML = `<p class="text-red-500">Erro: Configure seu Access Token do Mercado Pago em index.js</p>`;
        return;
    }
    const { vehicle, amount } = state.paymentData;
    if (amount <= 0) {
        finishPayment('pix'); // Free exit
        return;
    }

    try {
        const response = await fetch('https://api.mercadopago.com/v1/payments', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                transaction_amount: amount,
                description: `Estacionamento Placa ${vehicle.plate}`,
                payment_method_id: 'pix',
                payer: {
                    email: 'test_user_123456@testuser.com' // Required by Mercado Pago
                }
            })
        });
        const data = await response.json();
        if (data.point_of_interaction) {
            const qrCodeData = data.point_of_interaction.transaction_data.qr_code;
            const qrCodeBase64 = data.point_of_interaction.transaction_data.qr_code_base64;
            
            const qrcodeContainer = document.getElementById('qrcode-container');
            qrcodeContainer.innerHTML = `<img src="data:image/png;base64,${qrCodeBase64}" alt="PIX QR Code" class="mx-auto">`;

            // Start polling for payment status
            const paymentId = data.id;
            pixPollingInterval = setInterval(async () => {
                const statusResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                    headers: { 'Authorization': `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}` }
                });
                const statusData = await statusResponse.json();
                if (statusData.status === 'approved') {
                    clearInterval(pixPollingInterval);
                    document.getElementById('pix-status').textContent = 'Pagamento Aprovado!';
                    document.getElementById('pix-status').classList.remove('text-yellow-500');
                    document.getElementById('pix-status').classList.add('text-green-500');
                    setTimeout(() => finishPayment('pix'), 1000);
                }
            }, 3000);
        } else {
            throw new Error('Falha ao gerar PIX. Verifique a chave de acesso.');
        }
    } catch (error) {
         document.getElementById('qrcode-container').innerHTML = `<p class="text-red-500 text-sm">${error.message}</p>`;
         console.error(error);
    }
};


// --- PLATE SCANNER ---
let scannerWorker = null;
let videoStream = null;

const startScanner = async () => {
    const video = document.getElementById('scanner-video');
    const statusEl = document.getElementById('scanner-status');
    
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = videoStream;
        await video.play();
        
        scannerWorker = await Tesseract.createWorker('por', 1, {
            logger: m => console.log(m) 
        });

        const scan = async () => {
            if (!videoStream) return;
            try {
                const { data: { text } } = await scannerWorker.recognize(video);
                const plateRegex = /[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}/;
                const match = text.toUpperCase().match(plateRegex);
                if (match) {
                    const plate = match[0].replace('-', '');
                    document.getElementById('plate').value = plate;
                    statusEl.textContent = `Placa encontrada: ${plate}`;
                    statusEl.classList.add('text-green-500');
                    setTimeout(() => {
                        handleAppClick({ target: document.querySelector('[data-action="close-modal"]') });
                    }, 1000);
                } else {
                     requestAnimationFrame(scan);
                }
            } catch (err) {
                console.error('OCR Error:', err);
                if(videoStream) requestAnimationFrame(scan);
            }
        };
        requestAnimationFrame(scan);

    } catch (err) {
        let message = 'Erro ao acessar a câmera.';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            message = 'Acesso à câmera negado. Por favor, habilite a permissão nas configurações do seu navegador para este site.';
        }
        statusEl.textContent = message;
        statusEl.classList.add('text-red-500');
        console.error('Camera Error:', err);
    }
};

const stopScanner = async () => {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    if (scannerWorker) {
        await scannerWorker.terminate();
        scannerWorker = null;
    }
};


// --- INITIALIZATION ---
const setupFirebaseListeners = () => {
    db.ref('vehicles').on('value', (snapshot) => {
        const data = snapshot.val();
        const vehiclesArray = data ? Object.keys(data).map(key => ({
            ...data[key],
            __dbKey: key // Store the Firebase key
        })) : [];
        state.vehicles = vehiclesArray;
        renderApp();
    });

    db.ref('settings').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            state.settings = { ...state.settings, ...data };
        }
        // Don't re-render if we are on the admin page to avoid losing focus
        if (state.currentPage !== 'admin') {
            renderApp();
        }
    });
};

const init = () => {
    applyTheme();
    setupFirebaseListeners();
    document.addEventListener('click', handleAppClick);
    document.getElementById('app').addEventListener('input', handleSettingsChange);
};

// --- START APP ---
init();
