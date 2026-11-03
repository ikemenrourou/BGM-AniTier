// Original, identity-neutral vector standee. Inlined so it also works offline and in backups.
const hostSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="380" viewBox="0 0 320 380" fill="none">
  <g stroke="#313942" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="161" cy="361" rx="82" ry="10" fill="#18202A" fill-opacity=".1" stroke="none"/>
    <path d="M112 318l-8 27c-3 11 5 15 21 15h19l8-42m18 0 8 42h22c16 0 22-5 17-16l-13-26" fill="#48515D"/>
    <path d="M96 223c-20 9-37 35-42 60-3 16 19 25 29 10l25-32m112-38c20 9 35 28 41 48 5 16-15 27-27 13l-24-26" fill="#F1F0EA"/>
    <path d="M112 210c-25 18-32 52-28 90 2 24 29 37 76 37s74-13 76-37c4-38-3-72-28-90" fill="#B7C9CB"/>
    <path d="M130 214l30 30 30-30m-30 31v67" stroke="#657C81"/>
    <path d="M121 277h78v14c0 19-14 28-39 28s-39-9-39-28z" fill="#A1B8BC" stroke="#657C81" stroke-width="3"/>
    <path d="M79 120c0-62 33-94 81-94s81 32 81 94" stroke="#313942" stroke-width="18"/>
    <path d="M81 116c0-60 34-88 79-88s79 28 79 88" stroke="#B7C9CB" stroke-width="7"/>
    <path d="M71 129c0-55 35-91 89-91s89 36 89 91v34c0 44-37 68-89 68s-89-24-89-68z" fill="#F1F0EA"/>
    <path d="M135 41c-2-14 5-23 16-26m1 23c6-12 16-16 27-12" stroke="#313942"/>
    <rect x="59" y="118" width="27" height="55" rx="13" fill="#758F96"/>
    <rect x="234" y="118" width="27" height="55" rx="13" fill="#758F96"/>
    <path d="M111 122l12-3m74 3-12-3" stroke-width="3"/>
    <path d="M119 143v12m82-12v12" stroke-width="9"/>
    <ellipse cx="100" cy="169" rx="12" ry="6" fill="#DEB9B1" stroke="none"/>
    <ellipse cx="220" cy="169" rx="12" ry="6" fill="#DEB9B1" stroke="none"/>
    <path d="M149 171q11 12 22 0" stroke-width="4"/>
    <path d="M249 163c0 24-24 36-60 36" stroke-width="4"/>
    <rect x="171" y="193" width="24" height="11" rx="5.5" fill="#48515D" stroke-width="3"/>
    <g transform="rotate(-9 241 265)">
      <rect x="215" y="240" width="48" height="65" rx="7" fill="#F1F0EA" stroke-width="3"/>
      <path d="M227 253h24m-24 10h24m-24 10h15" stroke="#96A9AE" stroke-width="3"/>
    </g>
    <ellipse cx="238" cy="285" rx="16" ry="13" fill="#F1F0EA" stroke-width="4"/>
  </g>
</svg>`;

export const DEFAULT_HOST_AVATAR_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(hostSvg)}`;
