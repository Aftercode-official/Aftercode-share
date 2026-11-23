import { useState, useEffect } from "react";
import "./AgeVerificationModal.css";

const AGE_VERIFICATION_KEY = "aftercode-age-verified-v1";

export default function AgeVerificationModal({ onVerified }) {
  const [method, setMethod] = useState("button"); // "button" or "dob"
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Prevent closing with ESC to ensure compliance if age verification is required
      if (e.key === "Escape") {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleQuickVerify = () => {
    try {
      if (rememberMe) {
        localStorage.setItem(AGE_VERIFICATION_KEY, "true");
      } else {
        sessionStorage.setItem(AGE_VERIFICATION_KEY, "true");
      }
    } catch {
      // fallback
    }
    if (onVerified) onVerified();
  };

  const handleDobSubmit = (e) => {
    e.preventDefault();
    setError("");

    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);

    if (!d || !m || !y || isNaN(d) || isNaN(m) || isNaN(y)) {
      setError("Vui lòng nhập đầy đủ ngày, tháng, năm sinh hợp lệ.");
      return;
    }

    if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > new Date().getFullYear()) {
      setError("Ngày tháng năm sinh không hợp lệ.");
      return;
    }

    const birthDate = new Date(y, m - 1, d);
    if (birthDate.getFullYear() !== y || birthDate.getMonth() !== m - 1 || birthDate.getDate() !== d) {
      setError("Ngày sinh không tồn tại trong thực tế.");
      return;
    }

    const today = new Date();
    let age = today.getFullYear() - y;
    const mDiff = today.getMonth() - (m - 1);
    if (mDiff < 0 || (mDiff === 0 && today.getDate() < d)) {
      age--;
    }

    if (age < 18) {
      setError(`Bạn chưa đủ 18 tuổi (${age} tuổi). Xin lỗi, bạn không thể truy cập nội dung này.`);
      return;
    }

    try {
      if (rememberMe) {
        localStorage.setItem(AGE_VERIFICATION_KEY, "true");
      } else {
        sessionStorage.setItem(AGE_VERIFICATION_KEY, "true");
      }
    } catch {
      // fallback
    }
    if (onVerified) onVerified();
  };

  return (
    <div className="age-verification-backdrop">
      <div className="age-verification-panel" role="dialog" aria-modal="true" aria-labelledby="age-verify-title">
        <div className="age-verify-icon">🔞</div>
        <h2 id="age-verify-title">Xác thực độ tuổi</h2>
        <p className="age-verify-subtitle">
          Trang web này có chứa nội dung giới hạn độ tuổi. Vui lòng xác nhận rằng bạn đã đủ 18 tuổi trở lên để tiếp tục.
        </p>

        <div className="age-verify-tabs">
          <button
            type="button"
            aria-selected={method === "button"}
            onClick={() => { setMethod("button"); setError(""); }}
          >
            Xác nhận nhanh
          </button>
          <button
            type="button"
            aria-selected={method === "dob"}
            onClick={() => { setMethod("dob"); setError(""); }}
          >
            Nhập ngày sinh
          </button>
        </div>

        {error && <div className="age-verify-error">{error}</div>}

        {method === "button" ? (
          <div className="age-verify-content">
            <div className="age-verify-checkbox-wrapper">
              <label>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Ghi nhớ xác nhận trên thiết bị này
              </label>
            </div>
            <button type="button" className="age-verify-btn-primary" onClick={handleQuickVerify}>
              Tôi đã đủ 18 tuổi
            </button>
            <a
              href="https://www.google.com"
              className="age-verify-btn-secondary"
            >
              Tôi chưa đủ 18 tuổi
            </a>
          </div>
        ) : (
          <form onSubmit={handleDobSubmit} className="age-verify-form">
            <div className="dob-inputs">
              <label>
                <span>Ngày</span>
                <input
                  type="number"
                  placeholder="DD"
                  min="1"
                  max="31"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  required
                />
              </label>
              <label>
                <span>Tháng</span>
                <input
                  type="number"
                  placeholder="MM"
                  min="1"
                  max="12"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  required
                />
              </label>
              <label>
                <span>Năm</span>
                <input
                  type="number"
                  placeholder="YYYY"
                  min="1900"
                  max={new Date().getFullYear()}
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="age-verify-checkbox-wrapper">
              <label>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Ghi nhớ xác nhận trên thiết bị này
              </label>
            </div>

            <button type="submit" className="age-verify-btn-primary">
              Xác nhận tuổi
            </button>
            <a
              href="https://www.google.com"
              className="age-verify-btn-secondary"
            >
              Tôi chưa đủ 18 tuổi
            </a>
          </form>
        )}
      </div>
    </div>
  );
}
