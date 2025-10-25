export enum VehicleStatus {
  PARKED = 'parked',
  PAID = 'paid',
}

export enum PaymentMethod {
  PIX = 'pix',
  CASH = 'cash',
  CARD = 'card',
  CONVENIO = 'convenio',
}

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  color: string;
  entryTime: string;
  exitTime?: string;
  status: VehicleStatus;
  amountPaid?: number;
  paymentMethod?: PaymentMethod;
}

export interface Settings {
  hourlyRate: number;
  toleranceMinutes: number;
  fractionRate: number;
  fractionLimitMinutes: number;
  pixKey: string;
  pixHolderName: string;
  pixHolderCity: string;
}