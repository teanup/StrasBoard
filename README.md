# StrasBoard

Home dashboard integrating live info about public transport, weather, electricity prices, and more! Designed for Strasbourg, France.

## Weather Icons

Thanks to *TwinkleFork* for the beautiful [**`🌈 Weather Icon Pack v1.0`**](https://www.figma.com/community/file/1469636700953030456/weather-icon-pack-v1-0-bytwinklefork) licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

I applied minor modifications to the exported SVG files from Figma in order to fix the inner shadow effect.
The original SVG code used `feColorMatrix` filters, making the icons render rasterized in a browser.

```diff
  <feFlood flood-opacity="0" result="BackgroundImageFix"/>
  <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
- <feColorMatrix in="SourceAlpha" type="matrix" values="<alpha filter matrix>" result="hardAlpha"/>
- <feOffset dx="<dx>" dy="<dy>"/>
+ <feOffset in="SourceAlpha" dx="<dx>" dy="<dy>"/>
  <feGaussianBlur stdDeviation="<deviation>"/>
- <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>
- <feColorMatrix type="matrix" values="<color filter matrix>"/>
+ <feComposite in="SourceAlpha" operator="out" result="innerShadowMask"/>
+ <feFlood flood-color="<color filter>"/>
+ <feComposite in2="innerShadowMask" operator="in"/>
  <feBlend mode="<mode>" in2="shape" result="<result>"/>
```

I also created 10 extra icons, fully inspired by the original pack, in order to cover all 28 weather conditions returned by Open-Meteo:

| Name | WMO Code | Icon(s) |
|------|:--------:|:-------:|
| Rime fog | 48 | [![Rime fog](server/static/icon/rime_fog.svg)](server/static/icon/rime_fog.svg) |
| Light drizzle light | 51 | [![Light drizzle light](server/static/icon/drizzle_light.svg)](server/static/icon/drizzle_light.svg) |
| Heavy drizzle | 53 | [![Heavy drizzle](server/static/icon/drizzle_heavy.svg)](server/static/icon/drizzle_heavy.svg) |
| Light freezing drizzle | 56 | [![Light freezing drizzle](server/static/icon/freezing_drizzle_light.svg)](server/static/icon/freezing_drizzle_light.svg) |
| Freezing drizzle | 57 | [![Freezing drizzle](server/static/icon/freezing_drizzle.svg)](server/static/icon/freezing_drizzle.svg) |
| Light freezing rain | 66 | [![Light freezing rain](server/static/icon/freezing_rain_light.svg)](server/static/icon/freezing_rain_light.svg) |
| Heavy rain showers | 82 | [![Heavy rain showers day](server/static/icon/rain_showers_heavy_day.svg)](server/static/icon/rain_showers_heavy_day.svg) [![Heavy rain showers night](server/static/icon/rain_showers_heavy_night.svg)](server/static/icon/rain_showers_heavy_night.svg) |
| Light snow showers | 85 | [![Light snow showers day](server/static/icon/snow_showers_light_day.svg)](server/static/icon/snow_showers_light_day.svg) [![Light snow showers night](server/static/icon/snow_showers_light_night.svg)](server/static/icon/snow_showers_light_night.svg) |

These additional icons are also licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
