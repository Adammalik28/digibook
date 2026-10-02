# Generates local test documents (test-only content, not shipped).
import os, random, subprocess, textwrap
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from docx import Document
from docx.shared import Inches, Pt
from docx.enum.text import WD_BREAK
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
random.seed(7)

# ---------- chart image ----------
fig, ax = plt.subplots(figsize=(6, 3.2), dpi=110)
months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun"]
vals = [7120, 7310, 7050, 7480, 7620, 7590]
ax.plot(months, vals, marker="o", color="#2c5a4b")
ax.set_title("Contoh grafik (data fiktif untuk uji)")
ax.grid(alpha=.3)
fig.tight_layout()
fig.savefig("chart.png")

para_bank = [
    "Saham adalah bukti kepemilikan sebagian atas sebuah perusahaan. Ketika seseorang membeli saham, ia ikut memiliki hak atas laba dan aset perusahaan sesuai porsi kepemilikannya, sekaligus menanggung risiko jika kinerja perusahaan memburuk.",
    "Analisis fundamental berusaha menilai kesehatan bisnis melalui laporan keuangan, model bisnis, posisi persaingan, dan kualitas manajemen. Hasilnya dipakai untuk memperkirakan nilai wajar, bukan untuk menebak harga besok pagi.",
    "Analisis teknikal mempelajari pergerakan harga dan volume di masa lalu untuk mengenali pola. Pendekatan ini tidak menjamin hasil; ia membantu menyusun rencana masuk, keluar, dan batas kerugian secara disiplin.",
    "Manajemen risiko berarti menentukan berapa besar kerugian yang sanggup ditanggung sebelum membuka posisi. Diversifikasi, ukuran posisi yang wajar, dan dana darurat adalah fondasi yang sering diabaikan pemula.",
    "Valuasi selalu bergantung pada asumsi. Dua analis yang membaca laporan keuangan yang sama bisa menghasilkan angka nilai wajar yang berbeda karena memakai asumsi pertumbuhan dan tingkat diskonto yang berbeda pula.",
    "Laporan laba rugi menunjukkan pendapatan, beban, dan laba dalam satu periode. Neraca memotret aset, liabilitas, dan ekuitas pada satu titik waktu. Laporan arus kas menjelaskan dari mana uang masuk dan ke mana uang keluar.",
    "Rasio seperti PER dan PBV berguna sebagai titik awal perbandingan, tetapi tidak cukup untuk menyimpulkan murah atau mahal. Rasio harus dibaca bersama kualitas laba, utang, prospek industri, dan siklus bisnis.",
    "Disiplin mencatat setiap keputusan investasi membantu belajar dari kesalahan. Tulis alasan membeli, skenario yang diharapkan, dan kondisi yang membuat alasan itu tidak berlaku lagi.",
]

def para(n=1):
    return "\n\n".join(random.choice(para_bank) + (" " + random.choice(para_bank) if random.random() < .5 else "") for _ in range(n))

md = ["# Modul Uji Pustakaku", "", "*Dokumen ini dibuat otomatis untuk menguji aplikasi. Isinya contoh umum, bukan data pasar.*", ""]
for bab in range(1, 7):
    md.append(f"## Bab {bab}: {['Mengenal Pasar Saham','Membaca Laporan Keuangan','Valuasi Dasar','Analisis Teknikal','Manajemen Risiko','Menyusun Rencana'][bab-1]}")
    md.append("")
    md.append(para(3))
    md.append("")
    md.append(f"### {bab}.1 Konsep inti")
    md.append("")
    md.append(para(2) + "[^n%d]" % bab)
    md.append("")
    md.append("Poin penting yang perlu diingat:")
    md.append("")
    md.append("- Pahami bisnis sebelum melihat harga.")
    md.append("- Gunakan sumber resmi untuk data perusahaan.")
    md.append("    - Laporan tahunan dan laporan keuangan.")
    md.append("    - Keterbukaan informasi di situs bursa.")
    md.append("- Catat asumsi yang dipakai.")
    md.append("")
    md.append(f"### {bab}.2 Langkah praktis")
    md.append("")
    md.append("1. Tentukan tujuan dan jangka waktu.")
    md.append("2. Kumpulkan data dari laporan resmi.")
    md.append("3. Hitung rasio utama dan bandingkan dengan pesaing.")
    md.append("4. Tulis kesimpulan beserta risikonya.")
    md.append("")
    md.append(para(2))
    md.append("")
    md.append("| Rasio | Rumus | Kegunaan |")
    md.append("|---|---|---|")
    md.append("| PER | Harga / Laba per saham | Membandingkan harga dengan laba |")
    md.append("| PBV | Harga / Nilai buku per saham | Membandingkan harga dengan ekuitas |")
    md.append("| ROE | Laba bersih / Ekuitas | Mengukur efisiensi modal |")
    md.append("| DER | Total utang / Ekuitas | Mengukur ketergantungan pada utang |")
    md.append("")
    if bab == 2:
        md.append("![Contoh grafik harga fiktif](chart.png)")
        md.append("")
    md.append("> Catatan: angka dalam contoh ini fiktif dan hanya untuk latihan.")
    md.append("")
    md.append(para(4))
    md.append("")
    if bab == 3:
        md.append("```")
        md.append("Nilai wajar = Laba per saham x PER wajar")
        md.append("Margin keamanan = (Nilai wajar - Harga) / Nilai wajar")
        md.append("```")
        md.append("")
    md.append(f"Baca juga [halaman resmi bursa](https://www.idx.co.id) untuk istilah resmi.")
    md.append("")
    md.append(para(5))
    md.append("")
for bab in range(1, 7):
    md.append(f"[^n{bab}]: Catatan kaki uji nomor {bab}: penjelasan tambahan yang muncul di akhir dokumen.")
open("modul-uji.md", "w").write("\n".join(md))

subprocess.run(["pandoc", "modul-uji.md", "-o", "modul-uji.docx"], check=True)
subprocess.run(["pandoc", "modul-uji.md", "--toc", "-o", "modul-uji-toc.docx"], check=True)
subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "modul-uji.docx", "--outdir", HERE], check=True, capture_output=True)

# ---------- python-docx feature test ----------
doc = Document()
doc.core_properties.author = "Tim Uji"
doc.core_properties.title = "Fitur Word Lengkap"
doc.add_heading("Fitur Word Lengkap", 0)  # Title style
p = doc.add_paragraph("Paragraf dengan ")
p.add_run("tebal").bold = True
p.add_run(", ")
p.add_run("miring").italic = True
p.add_run(", ")
r = p.add_run("garis bawah"); r.underline = True
p.add_run(", H")
r = p.add_run("2"); r.font.subscript = True
p.add_run("O dan x")
r = p.add_run("2"); r.font.superscript = True
p.add_run(".")
doc.add_heading("Daftar berpoin dan bernomor", 1)
for t in ["Butir pertama", "Butir kedua", "Butir ketiga"]:
    doc.add_paragraph(t, style="List Bullet")
for t in ["Langkah satu", "Langkah dua", "Langkah tiga"]:
    doc.add_paragraph(t, style="List Number")
doc.add_heading("Tabel dengan sel gabungan", 1)
t = doc.add_table(rows=4, cols=3)
t.style = "Table Grid"
hdr = t.rows[0].cells
hdr[0].text, hdr[1].text, hdr[2].text = "Kode", "Sektor", "Catatan"
a = t.cell(1, 0).merge(t.cell(2, 0)); a.text = "Gabung vertikal"
b = t.cell(1, 1).merge(t.cell(1, 2)); b.text = "Gabung horizontal"
t.cell(2, 1).text = "Isi B3"; t.cell(2, 2).text = "Isi C3"
t.cell(3, 0).text = "X"; t.cell(3, 1).text = "Y"; t.cell(3, 2).text = "Z"
doc.add_paragraph("Gambar di bawah ini disisipkan dengan lebar 3 inci:")
doc.add_picture("chart.png", width=Inches(3))
pb = doc.add_paragraph("Setelah paragraf ini ada pemisah halaman.")
pb.add_run().add_break(WD_BREAK.PAGE)
doc.add_heading("Halaman baru", 1)
doc.add_paragraph("Teks ini seharusnya mulai di halaman baru karena ada page break.")
# hyperlink
def add_hyperlink(paragraph, url, text):
    part = paragraph.part
    r_id = part.relate_to(url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    h = OxmlElement("w:hyperlink"); h.set(qn("r:id"), r_id)
    nr = OxmlElement("w:r"); rpr = OxmlElement("w:rPr"); u = OxmlElement("w:u"); u.set(qn("w:val"), "single"); rpr.append(u); nr.append(rpr)
    tt = OxmlElement("w:t"); tt.text = text; nr.append(tt); h.append(nr); paragraph._p.append(h)
hp = doc.add_paragraph("Kunjungi ")
add_hyperlink(hp, "https://www.ojk.go.id", "situs OJK")
hp.add_run(" untuk regulasi.")
q = doc.add_paragraph("Ini kutipan dengan gaya Quote.", style="Quote")
c = doc.add_paragraph("Keterangan gambar 1: contoh caption.", style="Caption")
for i in range(12):
    doc.add_paragraph(random.choice(para_bank))
doc.save("fitur-uji.docx")

# ---------- cp1252 plain text ----------
txt = "BAB 1 PENDAHULUAN\n\n" + "\n".join(textwrap.wrap("Café naïve résumé – contoh teks dengan ejaan khusus “kutip” dan tanda pisah. " * 6, 70)) + "\n\n" + "\n".join(textwrap.wrap(para(3), 70)) + "\n\nBAB 2 LANJUTAN\n\n" + "\n".join(textwrap.wrap(para(4), 70)) + "\n"
open("teks-cp1252.txt", "wb").write(txt.encode("cp1252", errors="replace"))
print("ok")

# ---------- dokumen besar untuk uji kinerja (t7-perf) dan file besar (t6-big) ----------
body = open("modul-uji.md").read().split("\n", 3)[3]
big = ["# Modul Besar Uji", ""]
for i in range(10):
    big.append(body.replace("## Bab", f"## Bagian {i+1} — Bab").replace("[^n", f"[^p{i}n"))
open("besar.md", "w").write("\n".join(big))
subprocess.run(["pandoc", "besar.md", "-o", "besar.docx"], check=True)

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.utils import ImageReader
from PIL import Image
c = rl_canvas.Canvas("besar-25mb.pdf", pagesize=A4)
c.setTitle("Dokumen Besar Uji")
for i in range(6):
    img = Image.frombytes("RGB", (1500, 1500), os.urandom(1500 * 1500 * 3))  # derau acak agar tidak terkompresi
    c.setFont("Helvetica-Bold", 20); c.drawString(72, 780, f"Halaman gambar acak {i+1}")
    c.drawImage(ImageReader(img), 72, 200, width=450, height=450)
    c.bookmarkPage(f"p{i}"); c.addOutlineEntry(f"Bagian {i+1}", f"p{i}", level=0)
    c.showPage()
c.save()
print("dokumen besar ok")
