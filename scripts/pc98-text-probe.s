/* Original diagnostic TSR, GNU as --32 / objcopy -O binary.
 * Private research only. It does not include any game's instructions.
 * Keep 4096 bytes, with a 64-entry ring of 32-byte glyph observations.
 * The observer copies displaced instructions into resume_code and fills the
 * far return address only after checking the exact source executable.
 */
.code16
.intel_syntax noprefix
.section .text
.org 0x100
start:
    mov dx, 0x100
    mov ax, 0x3100
    int 0x21
.org 0x120
    .ascii "VNKIT-PC98-TEXT-PROBE-1"
.org 0x200
producer:
    .word 0
.org 0x300
glyph:
    pushf
    pusha
    push es
    mov bp, sp
    push cs
    pop es
    mov di, es:[0x200]
    and di, 63
    shl di, 5
    add di, 0x800
    mov word ptr es:[di], 1
    mov ax, ss:[bp+16]
    mov es:[di+2], ax
    mov ax, ds:[0xe654]
    mov es:[di+4], ax
    mov ax, ds:[0xe656]
    mov es:[di+6], ax
    mov ax, ds:[0xe65a]
    mov es:[di+8], ax
    mov es:[di+10], si
    mov ax, ds
    mov es:[di+12], ax
    mov ax, ss:[bp+2]
    mov es:[di+14], ax
    inc word ptr es:[0x200]
    pop es
    popa
    popf
    jmp resume_code
.org 0x370
resume_code:
    .fill 6,1,0xcc
    .byte 0xea
    .word 0,0
