'use client';

import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';

interface Props {
  letterText: string;
  paragraphs: string[];
  error?: string;
}

const styles = StyleSheet.create({
  page: { padding: 56, fontSize: 11, lineHeight: 1.5, fontFamily: 'Helvetica' },
  para: { marginBottom: 12 },
});

function LetterDoc({ paragraphs }: { paragraphs: string[] }) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {paragraphs.map((p, i) => (
          <View key={i} style={styles.para}>
            <Text>{p}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export default function CoverLetterOutput({ letterText, paragraphs, error }: Props) {
  if (!letterText) {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        {error || 'No cover letter was produced.'}
      </div>
    );
  }

  async function download() {
    const blob = await pdf(<LetterDoc paragraphs={paragraphs} />).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cover-letter.pdf';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cover letter</h2>
        <button
          type="button"
          onClick={download}
          className="rounded bg-black px-3 py-1 text-sm text-white hover:bg-gray-800"
        >
          Download PDF
        </button>
      </div>
      <div className="space-y-3 rounded border border-gray-200 p-4 text-sm">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}
