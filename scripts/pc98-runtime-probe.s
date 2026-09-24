/* Original MIT diagnostic TSR. No game instructions are present in this file.
 * The private observer validates the executable and fills displaced-code slots
 * and far returns. 8 KiB resident allocation includes a 64 × 64 byte ring.
 */
.code16
.intel_syntax noprefix
.section .text
.org 0x100
    mov dx, 0x200
    mov ax, 0x3100
    int 0x21
.org 0x120
    .ascii "VNKIT-PC98-RUNTIME-PROBE-2"
.org 0x200
    .word 0
.macro ENTER kind
    pushf
    pusha
    push ds
    push es
    mov bp, sp
    mov ax, \kind
    call record
.endm
.macro LEAVE target
    pop es
    pop ds
    popa
    popf
    jmp \target
.endm
.macro RESUME size
    .fill \size,1,0xcc
    .byte 0xea
    .word 0,0
.endm
.org 0x300
    ENTER 1
    LEAVE full_resume
.org 0x370
full_resume:
    RESUME 6
.org 0x400
    ENTER 2
    LEAVE file_resume
.org 0x470
file_resume:
    RESUME 6
.org 0x500
    pushf
    pusha
    push ds
    push es
    mov bp, sp
    cmp al, 0x11
    je command
    cmp al, 0x16
    je command
    cmp al, 0x17
    jne command_end
command:
    mov ax, 3
    call record
command_end:
    LEAVE cmd_resume
.org 0x570
cmd_resume:
    RESUME 5
.org 0x600
    ENTER 4
    LEAVE blit_resume
.org 0x670
blit_resume:
    RESUME 5
.org 0x700
    ENTER 5
    LEAVE swap_resume
.org 0x770
swap_resume:
    RESUME 5
.org 0x800
    ENTER 6
    LEAVE mask_resume
.org 0x870
mask_resume:
    RESUME 8
.org 0x900
    ENTER 7
    LEAVE half_resume
.org 0x970
half_resume:
    RESUME 5
.org 0xa00
    ENTER 8
    LEAVE clear_resume
.org 0xa70
clear_resume:
    RESUME 8
.org 0xb00
record:
    cld
    push cs
    pop es
    mov di, es:[0x200]
    and di, 63
    shl di, 6
    add di, 0x1000
    stosw
    /* Original ES, DS, DI, SI, BP, SP, BX, DX, CX, AX, FLAGS. */
    mov si, bp
    mov cx, 11
    ss rep movsw
    cmp ax, 2
    je filename
    cmp ax, 4
    jb fields
    cmp ax, 6
    ja fields
    /* Blit: evaluated arguments, plus current source fields. */
    mov si, 0xf096
    mov cx, 16
    rep movsw
    mov si, 0xe63e
    mov cx, 4
    rep movsw
    jmp done
fields:
    /* AI5 system @6..25, including target surface and text metrics. */
    mov si, 0xe63e
    mov cx, 20
    rep movsw
    jmp done
filename:
    mov si, ss:[bp+14]
    mov cx, 16
    rep movsb
done:
    inc word ptr es:[0x200]
    ret
