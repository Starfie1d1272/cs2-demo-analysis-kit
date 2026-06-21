// 进点路线「地道叫法」词典（手填真相源）。
//
// 定位：把 (地图, 包点, 进点 chokeId 组合) 映射到队内/解说常用的中文证据描述，
//       只供进点 evidence 展示，不得用于主聚类身份或主战术名。combo 的 chokeId 取自 site-entry-chokes.ts 的 entry id，
//       字母序、以 + 连接（与 SiteEntryFact.distinctEntryChokeIds 排序一致）。
// 来源：158 场真实 demo（科隆 Major Stage1 + pro + NJU）统计出的反复出现组合（≥3 次）。
// 填法：只填每条的 cn（地道叫法，如「走A大」「甜甜圈夹A」「交道打一波」），格式无需改动。
//       cn 留空的组合，展示层回退为入口 callout 组合，不会自动拍成战术名称。

export interface EntryRouteName {
  /** 进点 chokeId 组合（字母序 + 连接）。 */
  combo: string;
  /** 地道叫法，留空待填。 */
  cn: string;
}

/** 取某组合的 evidence 文案；未收录或未填返回空串（由展示层兜底）。 */
export function entryRouteCn(mapName: string, site: "a" | "b", combo: string): string {
  return SITE_ENTRY_LEXICON[mapName]?.[site]?.find((row) => row.combo === combo)?.cn ?? "";
}

export const SITE_ENTRY_LEXICON: Record<string, Partial<Record<"a" | "b", EntryRouteName[]>>> = {
  de_ancient: {
    a: [
      { combo: "a_main", cn: "A厅爆A" },                                // 163次 · A厅
      { combo: "a_main+a_side_hall", cn: "甜甜圈夹A" },                    //  50次 · A厅 + 甜甜圈
      { combo: "a_side_hall", cn: "甜甜圈进A" },                           //  46次 · 甜甜圈
      { combo: "a_ct_spawn", cn: "警家入侵A包" },                            //  12次 · 警家
      { combo: "a_ct_spawn+a_main", cn: "警家夹A" },                     //   9次 · 警家 + A厅
      { combo: "a_ct_spawn+a_side_hall", cn: "警家甜甜圈夹A" },                //   6次 · 警家 + 甜甜圈
    ],
    b: [
      { combo: "b_ramp", cn: "B坡爆B" },                                // 192次 · B坡
      { combo: "b_ramp+b_side_entrance", cn: "黑屋夹B" },                //  79次 · B坡 + 黑屋
      { combo: "b_side_entrance", cn: "黑屋打B" },                       //  24次 · 黑屋
      { combo: "b_alley+b_ramp", cn: "底线夹B" },                        //  10次 · 底线 + B坡
      { combo: "b_alley", cn: "底线转B" },                               //   8次 · 底线
    ],
  },
  de_anubis: {
    a: [
      { combo: "a_main", cn: "A厅爆A" },                                //  35次 · A厅/喷泉
      { combo: "a_main+a_walkway", cn: "中路夹A" },                      //  12次 · A厅/喷泉 + A连
      { combo: "a_walkway", cn: "中路进A" },                             //  11次 · A连
    ],
    b: [
      { combo: "b_connector+b_outside", cn: "黑屋夹B" },                 //  42次 · 黑屋 + B外
      { combo: "b_outside", cn: "B外爆B" },                             //  32次 · B外
      { combo: "b_connector", cn: "黑屋打B" },                           //   8次 · 黑屋
      { combo: "b_bricks+b_outside", cn: "中路夹B" },                    //   7次 · B连阳光房 + B外
      { combo: "b_bricks", cn: "中路进B" },                              //   4次 · B连阳光房
    ],
  },
  de_dust2: {
    a: [
      { combo: "a_short_entry", cn: "A小爆弹" },                         // 135次 · A小过点
      { combo: "a_long_entry", cn: "打A大" },                          //  93次 · A斜坡
      { combo: "a_long_entry+a_short_entry", cn: "夹A" },            //  16次 · A斜坡 + A小过点
    ],
    b: [
      { combo: "b_upper_tunnel", cn: "爆B" },                        // 178次 · B洞
      { combo: "b_mid_doors+b_upper_tunnel", cn: "夹B" },            //  50次 · B门/狗洞 + B洞
      { combo: "b_mid_doors", cn: "中路打B" },                           //  21次 · B门/狗洞
    ],
  },
  de_inferno: {
    a: [
      { combo: "a1", cn: "打A1" },                                    // 118次 · 中路/马棚
      { combo: "a1+a_connector", cn: "链接夹A" },                        //  59次 · 中路/马棚 + 拱门/书房
      { combo: "a1+a2", cn: "A1A2协同" },                                 //  53次 · 中路/马棚 + 阳台
      { combo: "a2", cn: "飞二楼" },                                    //  22次 · 阳台
      { combo: "a_connector", cn: "链接打A" },                           //  14次 · 拱门/书房
      { combo: "a2+a_connector", cn: "A2链接协同" },                        //  10次 · 阳台 + 拱门/书房
      { combo: "a1+a2+a_connector", cn: "链接夹A" },                     //   9次 · 中路/马棚 + 阳台 + 拱门/书房
    ],
    b: [
      { combo: "b_banana", cn: "蕉道一波" },                              // 256次 · 香蕉道
      { combo: "b_banana+b_ruins", cn: "链接夹B" },                      //  15次 · 香蕉道 + 警家教堂
      { combo: "b_ruins", cn: "链接转B" },                               //   3次 · 警家教堂
    ],
  },
  de_mirage: {
    a: [
      { combo: "a_palace", cn: "A2展开" },                              // 182次 · A二楼/A2上下
      { combo: "a_connector+a_palace", cn: "拱门夹A" },                  //  77次 · 拱门 + A二楼/A2上下
      { combo: "a_connector", cn: "拱门进A" },                           //  36次 · 拱门
      { combo: "a_connector+a_jungle+a_palace", cn: "拱门jungle夹A" },         //  10次 · 拱门 + Jungle + A二楼/A2上下
      { combo: "a_connector+a_jungle", cn: "拱门Jungle展开" },                  //   5次 · 拱门 + Jungle
    ],
    b: [
      { combo: "b_apartments", cn: "B2爆弹" },                          // 107次 · B二楼/白车
      { combo: "b_apartments+b_short", cn: "B小夹B" },                  //  55次 · B二楼/白车 + B小
      { combo: "b_short", cn: "B小进B" },                               //  20次 · B小
      { combo: "b_market", cn: "超市夹B" },                              //   3次 · 超市
    ],
  },
  de_nuke: {
    a: [
      { combo: "a_squeaky", cn: "铁门展开进A" },                             //  56次 · 铁门房
      { combo: "a_hut+a_squeaky", cn: "爆A" },                       //  55次 · 黄房 + 铁门房
      { combo: "a_hut", cn: "黄房进A" },                                 //  30次 · 黄房
      { combo: "a_mini+a_squeaky", cn: "正门夹A" },                      //  20次 · 正门 + 铁门房
      { combo: "a_mini", cn: "正门进A" },                                //  19次 · 正门
      { combo: "a_hut+a_mini", cn: "正门夹A" },                          //  15次 · 黄房 + 正门
      { combo: "a_hut+a_mini+a_squeaky", cn: "正门夹A" },                //   9次 · 黄房 + 正门 + 铁门房
      { combo: "a_heaven", cn: "三楼进A" },                              //   5次 · 三楼/三楼横梁
      { combo: "a_heaven+a_mini", cn: "正门三楼同步" },                       //   3次 · 三楼/三楼横梁 + 正门
    ],
    b: [
      { combo: "b_ramp", cn: "铁板进B" },                                //  51次 · 铁板
      { combo: "b_decon+b_tunnels", cn: "K1进B" },                     //  28次 · 死门 + K1地下/控制室
      { combo: "b_decon", cn: "死门进B" },                               //  21次 · 死门
      { combo: "b_tunnels", cn: "活门控制室进B" },                             //  19次 · K1地下/控制室
      { combo: "b_decon+b_ramp", cn: "铁板死门夹B" },                        //   8次 · 死门 + 铁板
      { combo: "b_ramp+b_tunnels", cn: "铁板活门夹B" },                      //   6次 · 铁板 + K1地下/控制室
      { combo: "b_decon+b_ramp+b_tunnels", cn: "三点同步夹B" },              //   3次 · 死门 + 铁板 + K1地下/控制室
    ],
  },
  de_overpass: {
    a: [
      { combo: "a_lower_park", cn: "A小爆弹" },                          //  23次 · A小厕所
      { combo: "a_upper_park", cn: "A大爆弹" },                          //  21次 · A大厕所
      { combo: "a_lower_park+a_upper_park", cn: "夹A" },             //  18次 · A小爆弹 + A大爆弹
    ],
    b: [
      { combo: "b_monster+b_short", cn: "工地长管夹B" },                     //  31次 · 长管 + B小/桥
      { combo: "b_monster", cn: "长管爆B" },                             //  22次 · 长管
      { combo: "b_short", cn: "B小打B" },                               //  14次 · B小/桥
    ],
  },
};
