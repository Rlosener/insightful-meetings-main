import ZoomImportSection from "@/components/ZoomImportSection";

const ZoomImportPage = () => {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold mb-1">Zoom Kayıt Yükleme</h1>
        <p className="text-sm text-muted-foreground">
          Zoom kayıt ve transkript dosyalarını yükleyerek Donebird AI analizi başlatın.
        </p>
      </div>
      <ZoomImportSection />
    </div>
  );
};

export default ZoomImportPage;
