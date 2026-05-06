const AdminPlaceholder = ({ title }: { title: string }) => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="text-center">
      <h2 className="font-display font-semibold text-[2rem] text-foreground mb-2">{title}</h2>
      <p className="font-body text-muted-foreground">This section is coming soon.</p>
    </div>
  </div>
);

export default AdminPlaceholder;
