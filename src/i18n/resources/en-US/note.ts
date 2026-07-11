const note = {
  loading: "Loading note...",
  externalChange: {
    message: "This note was changed in another app.",
    reload: "Load changes",
    ignore: "Keep current content",
  },
  status: {
    readOnly: "Read-only",
    alwaysOnTop: "Always on top",
  },
} as const;

export default note;
