export default function RuptixLogo({className=""}) {
  return (
    <span className={"ruptix-logo "+className} aria-label="Ruptix">
      <span className="ruptix-official-mark" aria-hidden="true">
        <i className="ruptix-cut ruptix-cut-a" />
        <i className="ruptix-cut ruptix-cut-b" />
      </span>
      <span className="ruptix-wordmark">RUPTIX</span>
    </span>
  );
}
