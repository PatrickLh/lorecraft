<template>
  <svg class="ink-landscape" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <filter id="ink-edge" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency=".025 .08" numOctaves="3" seed="8" result="grain" />
        <feDisplacementMap in="SourceGraphic" in2="grain" scale="9" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <linearGradient id="mountain-wash" x2="0" y2="1"><stop stop-color="#5b6761" stop-opacity=".5"/><stop offset="1" stop-color="#87918a" stop-opacity=".04"/></linearGradient>
      <linearGradient id="near-wash" x2="0" y2="1"><stop stop-color="#283c35" stop-opacity=".75"/><stop offset="1" stop-color="#53645b" stop-opacity=".12"/></linearGradient>
    </defs>
    <circle cx="853" cy="115" r="44" fill="#b45642" opacity=".65"/>
    <g filter="url(#ink-edge)">
    <path d="M0 420Q40 375 90 335L140 354Q201 263 250 193L279 207Q306 152 321 157Q341 170 356 225L412 302Q460 270 489 248L543 326Q595 230 622 247L675 337Q714 293 736 286L827 372Q878 274 899 251L934 281Q970 200 985 208Q1005 220 1040 314L1110 355Q1160 320 1200 283V600H0Z" fill="url(#mountain-wash)"/>
    <path d="m0 456 102-38 100 31 110-160 24 19 30-67 40 65 31 4 86 102 115-54 140 114 160-134 40 31 47-103 46 29 48 91 83-29v213H0Z" fill="url(#near-wash)"/>
    </g>
    <g fill="none" stroke="#344b40" opacity=".2"><path d="m310 289 40 88-22 63m38-199 7 101 52 70m523-142-24 116 52 55m59-220-12 131 47 80"/><path d="M0 526q230-60 410 10t410-3 380 15M150 568q300-35 560 0t490-9"/></g>
    <g stroke="#374a40" stroke-width="2" fill="none" opacity=".55"><path d="m719 166 9-4 9 4m26-19 8-4 8 4m25 28 7-3 7 3"/></g>
    <g transform="translate(100 476)" fill="#263e32" opacity=".8"><path d="m0 70 6-159 4 159z"/><path d="M7-89-29-53H0L-42-25H2L-50 5H58L17-25H50L16-53H38Z"/></g>
    <g transform="translate(1130 528) scale(.6)" fill="#263e32" opacity=".75"><path d="m0 70 6-159 4 159z"/><path d="M7-89-29-53H0L-42-25H2L-50 5H58L17-25H50L16-53H38Z"/></g>
  </svg>
</template>
