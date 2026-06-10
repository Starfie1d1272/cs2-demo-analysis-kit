import { Hammer } from "lucide-react";

/**
 * 未实现模块的占位视图：展示模块定位与已排期的能力清单（来自 docs/roadmap.md），
 * 让测试用户知道这里将来是什么、现在为什么是空的。
 */

export interface ComingSoonViewProps {
  title: string;
  description: string;
  planned: string[];
  /** 该能力目前部分散落在哪些已有模块（提示用户先去哪看） */
  availableNow?: string;
}

export function ComingSoonView({ title, description, planned, availableNow }: ComingSoonViewProps) {
  return (
    <div className="stu-view">
      <header className="stu-view-header">
        <div>
          <h1>
            {title} <span className="stu-wip-badge">制作中</span>
          </h1>
          <p>{description}</p>
        </div>
      </header>
      <div className="stu-coming">
        <div className="stu-coming-mark">
          <Hammer size={22} />
        </div>
        <h2>该模块正在制作中</h2>
        {availableNow && <p className="stu-dim">{availableNow}</p>}
        <div className="stu-coming-list">
          <h3>排期中的能力</h3>
          <ul>
            {planned.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
