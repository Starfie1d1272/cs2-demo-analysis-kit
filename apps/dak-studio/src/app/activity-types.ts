export interface ActivityActions { tryBegin: () => (() => void) | null; setNotice: (message: string | null) => void }
