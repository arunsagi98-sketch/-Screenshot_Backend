import PyPDF2

def check_pdf(path):
    with open(path, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        print(f"Total Pages: {len(reader.pages)}")

if __name__ == "__main__":
    try:
        check_pdf("Campaign_Report_Final.pdf")
    except Exception as e:
        print(f"Error: {e}")
