from app.printer.base import Marker
from app.printer.reasons import offline_alert, split_suffix, translate

E02 = "Sense paper. Posa fulls a la safata posterior i prem OK a la impressora (E02)."


def test_suffix_split():
    assert split_suffix("media-empty-error") == ("media-empty", "error")
    assert split_suffix("marker-supply-low-warning") == ("marker-supply-low", "warning")
    assert split_suffix("spool-area-full-report") == ("spool-area-full", "report")
    assert split_suffix("paused") == ("paused", None)


def test_media_empty_and_needed_collapse_into_one_alert():
    alerts = translate(["media-empty-error", "media-needed-error"])
    assert len(alerts) == 1
    assert alerts[0].message == E02
    assert alerts[0].severity == "error"
    assert alerts[0].code == "media-empty"


def test_suffix_decides_severity():
    assert translate(["media-jam-warning"])[0].severity == "warning"
    assert translate(["media-jam-report"])[0].severity == "info"
    assert translate(["media-jam-error"])[0].severity == "error"
    assert translate(["media-jam"])[0].severity == "error"  # per defecte


def test_known_messages():
    assert translate(["media-jam-error"])[0].message.startswith("Paper encallat")
    assert translate(["cover-open-error"])[0].message == "Tapa oberta."
    assert translate(["door-open-warning"])[0].message == "Tapa oberta."
    assert translate(["output-area-full-warning"])[0].message == "Obre la safata de sortida."
    assert translate(["output-tray-missing-error"])[0].message == "Obre la safata de sortida."


def test_ink_names_the_cartridge():
    markers = [Marker("Color", ["#00CFFF"], 0, 15, 100), Marker("Black", ["#000000"], 40, 15, 100)]
    assert translate(["marker-supply-low-warning"], markers)[0].message == "Queda poca tinta de color."
    markers[1].level = 10
    assert translate(["marker-supply-low-warning"], markers)[0].message == "Queda poca tinta de color i negre."
    assert translate(["marker-supply-empty-error"], markers)[0].message == "Cartutx de color buit."
    assert translate(["marker-supply-empty-error"], [])[0].message == "Hi ha un cartutx buit."
    assert translate(["marker-supply-low-warning"])[0].message == "Queda poca tinta."


def test_spool_area_full_is_hidden():
    assert translate(["spool-area-full-report"]) == []
    assert translate(["none"]) == []


def test_unknown_reason_kept_raw(caplog):
    caplog.set_level("INFO")
    alerts = translate(["interpreter-resource-unavailable-warning"])
    assert alerts[0].message == "interpreter-resource-unavailable-warning"
    assert alerts[0].severity == "unknown"
    assert "desconegut" in caplog.text


def test_sorted_by_severity():
    alerts = translate(["marker-supply-low-warning", "media-empty-error"])
    assert [a.severity for a in alerts] == ["error", "warning"]


def test_offline():
    a = offline_alert()
    assert a.severity == "error"
    assert "Apagada" in a.message
