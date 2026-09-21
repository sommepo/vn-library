// Display-only preferences; never tint source images or change execution state.
export const THEME_DEFAULTS = {uiHue:242,uiSaturation:20,uiOpacity:1};
export function applyTheme(settings={}) {
  const normalized={};
  for(const [name,variable,min,max,suffix] of [['uiHue','--ui-hue',0,360,''],['uiSaturation','--ui-saturation',0,100,'%'],['uiOpacity','--ui-opacity',0,1,'']]) {
    const value=settings[name];
    normalized[name]=Number.isFinite(value)?Math.max(min,Math.min(max,value)):THEME_DEFAULTS[name];
    document.documentElement.style.setProperty(variable,`${normalized[name]}${suffix}`);
  }
  document.body.classList.toggle('dim-surroundings',settings.dimSurroundings===true);
  return normalized;
}
