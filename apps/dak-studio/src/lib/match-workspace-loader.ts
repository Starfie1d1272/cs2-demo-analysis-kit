import { getMapCalibration, hasLowerLevel } from '@cs2dak/maps/calibration';
import { analyzeMatchWorkspace } from '@cs2dak/pipeline';
import type { MatchWorkspaceModel } from '@cs2dak/presentation';
import { getDemoPackage } from './library';

/**
 * 单场工作台 model 懒算：从 ZIP 重建 pkg 再构 workspace。
 * 不在导入时持久化（workspace model 单场 ~35MB，整包全量分析，是导入内存/耗时大头），
 * 只在打开该场工作台/教练回放时按需构建——与 getDemoPackage 同款懒加载策略。
 */
export async function loadMatchWorkspaceModel(demoId: string): Promise<MatchWorkspaceModel> {
  const pkg = await getDemoPackage(demoId);
  const calibration = getMapCalibration(pkg.match.mapName);
  return analyzeMatchWorkspace(pkg, {
    radarImageUrl: calibration ? `./maps/radars/${pkg.match.mapName}.png` : null,
    lowerRadarImageUrl:
      calibration && hasLowerLevel(calibration)
        ? `./maps/radars/${pkg.match.mapName}_lower.png`
        : null,
  });
}
