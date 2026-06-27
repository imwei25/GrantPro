import { useEffect } from "react";

// 在当前挂载的模块内, 监听 Ctrl+Enter / ⌘+Enter 触发提交。
// 同一时刻只有一个模块挂载, 故用 window 级监听即可; onSubmit 自身已对
// "必填为空 / 运行中" 做了守卫, 这里只负责转发快捷键。
export function useCtrlEnterSubmit(onSubmit: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        onSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSubmit]);
}
