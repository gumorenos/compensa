export interface ProfileActionState {
  status: "IDLE" | "SUCCESS" | "ERROR";
  message: string;
}

export const initialProfileActionState: ProfileActionState = {
  status: "IDLE",
  message: "",
};
