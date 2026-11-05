export type PanelConfig = {
  id: string;
  name: string;
  baseUrl: string;
  usernameCiphertext: string;
  passwordCiphertext: string;
  groupIds: number[];
  createdAt: number;
  updatedAt: number;
};
export type PanelPublicSummary = Omit<PanelConfig, "usernameCiphertext" | "passwordCiphertext">;
