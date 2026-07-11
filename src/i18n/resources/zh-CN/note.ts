const note = {
  loading: "正在加载便签…",
  externalChange: {
    message: "此便签已在其他应用中更改。",
    reload: "加载更改",
    ignore: "保留当前内容",
  },
  status: {
    readOnly: "只读",
    alwaysOnTop: "始终置顶",
  },
} as const;

export default note;
