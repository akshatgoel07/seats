package httpx

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestGzipCompressesLargeJSON(t *testing.T) {
	body := []byte(`{"data":"` + strings.Repeat("x", gzipMinSize) + `"}`)
	rr := serveGzip(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}), true)

	if got := rr.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("content-encoding = %q, want gzip", got)
	}
	assertSingleVary(t, rr.Header(), "Accept-Encoding")
	got := gunzipBody(t, rr.Body.Bytes())
	if !bytes.Equal(got, body) {
		t.Fatalf("gunzipped body = %q, want %q", got, body)
	}
}

func TestGzipLeavesSmallBodyUncompressed(t *testing.T) {
	body := []byte(`{"ok":true}`)
	rr := serveGzip(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}), true)

	if got := rr.Header().Get("Content-Encoding"); got != "" {
		t.Fatalf("content-encoding = %q, want empty", got)
	}
	if !bytes.Equal(rr.Body.Bytes(), body) {
		t.Fatalf("body = %q, want %q", rr.Body.Bytes(), body)
	}
}

func TestGzipPassesThroughWhenClientDoesNotAcceptGzip(t *testing.T) {
	body := []byte(`{"data":"` + strings.Repeat("x", gzipMinSize) + `"}`)
	rr := serveGzip(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}), false)

	if got := rr.Header().Get("Content-Encoding"); got != "" {
		t.Fatalf("content-encoding = %q, want empty", got)
	}
	if !bytes.Equal(rr.Body.Bytes(), body) {
		t.Fatalf("body = %q, want %q", rr.Body.Bytes(), body)
	}
}

func TestGzipLeavesNonJSONUncompressed(t *testing.T) {
	body := []byte(strings.Repeat("plain text", gzipMinSize/len("plain text")+1))
	rr := serveGzip(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write(body)
	}), true)

	if got := rr.Header().Get("Content-Encoding"); got != "" {
		t.Fatalf("content-encoding = %q, want empty", got)
	}
	if !bytes.Equal(rr.Body.Bytes(), body) {
		t.Fatalf("body = %q, want %q", rr.Body.Bytes(), body)
	}
}

func TestGzipPreservesStatus(t *testing.T) {
	body := []byte(`{"data":"` + strings.Repeat("x", gzipMinSize) + `"}`)
	rr := serveGzip(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write(body)
	}), true)

	if rr.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusCreated)
	}
	if got := rr.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("content-encoding = %q, want gzip", got)
	}
}

func TestCheckETagAndGzipVaryOnlyOnce(t *testing.T) {
	body := []byte(`{"data":"` + strings.Repeat("x", gzipMinSize) + `"}`)
	h := Gzip()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if CheckETag(w, r, `"x-v1"`) {
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	if got := rr.Header().Get("ETag"); got != `"x-v1"` {
		t.Fatalf("etag = %q, want %q", got, `"x-v1"`)
	}
	if got := rr.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("content-encoding = %q, want gzip", got)
	}
	assertSingleVary(t, rr.Header(), "Accept-Encoding")

	rr = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	req.Header.Set("If-None-Match", `"x-v1"`)
	h.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotModified {
		t.Fatalf("status = %d, want 304", rr.Code)
	}
	if rr.Body.Len() != 0 {
		t.Fatalf("body length = %d, want 0", rr.Body.Len())
	}
	if got := rr.Header().Get("Content-Encoding"); got != "" {
		t.Fatalf("content-encoding = %q, want empty", got)
	}
	assertSingleVary(t, rr.Header(), "Accept-Encoding")
}

func TestGzipFlushDrainsSubThresholdWrite(t *testing.T) {
	first := []byte(`{"data":"` + strings.Repeat("x", 96))
	second := []byte(`"}`)
	unblock := make(chan struct{})

	srv := httptest.NewServer(Gzip()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(first)
		w.(http.Flusher).Flush()
		<-unblock
		_, _ = w.Write(second)
	})))
	defer srv.Close()

	client := srv.Client()
	client.Transport = &http.Transport{DisableCompression: true}
	req, err := http.NewRequest(http.MethodGet, srv.URL, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Accept-Encoding", "gzip")

	respCh := make(chan struct {
		resp *http.Response
		err  error
	}, 1)
	go func() {
		resp, err := client.Do(req)
		respCh <- struct {
			resp *http.Response
			err  error
		}{resp: resp, err: err}
	}()

	var resp *http.Response
	select {
	case res := <-respCh:
		if res.err != nil {
			t.Fatal(res.err)
		}
		resp = res.resp
	case <-time.After(2 * time.Second):
		close(unblock)
		t.Fatal("response headers did not flush before handler returned")
	}
	defer resp.Body.Close()
	if got := resp.Header.Get("Content-Encoding"); got != "gzip" {
		close(unblock)
		t.Fatalf("content-encoding = %q, want gzip", got)
	}

	zr, err := gzip.NewReader(resp.Body)
	if err != nil {
		close(unblock)
		t.Fatalf("gzip reader: %v", err)
	}
	defer zr.Close()

	gotFirst := make([]byte, len(first))
	readCh := make(chan error, 1)
	go func() {
		_, err := io.ReadFull(zr, gotFirst)
		readCh <- err
	}()
	select {
	case err := <-readCh:
		if err != nil {
			close(unblock)
			t.Fatalf("read first chunk: %v", err)
		}
	case <-time.After(2 * time.Second):
		close(unblock)
		t.Fatal("first chunk did not flush before handler returned")
	}
	if !bytes.Equal(gotFirst, first) {
		close(unblock)
		t.Fatalf("first chunk = %q, want %q", gotFirst, first)
	}

	close(unblock)
	rest, err := io.ReadAll(zr)
	if err != nil {
		t.Fatalf("read rest: %v", err)
	}
	if !bytes.Equal(rest, second) {
		t.Fatalf("rest = %q, want %q", rest, second)
	}
}

func TestCheckETag(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("If-None-Match", `"x-v1"`)
	rr := httptest.NewRecorder()

	if !CheckETag(rr, req, `"x-v1"`) {
		t.Fatal("CheckETag returned false for matching etag")
	}
	if rr.Code != http.StatusNotModified {
		t.Fatalf("status = %d, want 304", rr.Code)
	}
	if got := rr.Header().Get("ETag"); got != `"x-v1"` {
		t.Fatalf("etag = %q, want %q", got, `"x-v1"`)
	}
	if got := rr.Header().Get("Cache-Control"); got != "private, must-revalidate" {
		t.Fatalf("cache-control = %q, want private, must-revalidate", got)
	}
	assertSingleVary(t, rr.Header(), "Accept-Encoding")

	req = httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("If-None-Match", `"other"`)
	rr = httptest.NewRecorder()
	if CheckETag(rr, req, `"x-v1"`) {
		t.Fatal("CheckETag returned true for non-matching etag")
	}
	if rr.Body.Len() != 0 {
		t.Fatalf("body length = %d, want 0", rr.Body.Len())
	}
	if got := rr.Header().Get("ETag"); got != `"x-v1"` {
		t.Fatalf("etag = %q, want %q", got, `"x-v1"`)
	}

	rr = httptest.NewRecorder()
	if CheckETag(rr, req, `"x-v2"`) {
		t.Fatal("CheckETag returned true for a different current etag")
	}
	if got := rr.Header().Get("ETag"); got != `"x-v2"` {
		t.Fatalf("etag = %q, want %q", got, `"x-v2"`)
	}
}

func serveGzip(t *testing.T, h http.Handler, acceptGzip bool) *httptest.ResponseRecorder {
	t.Helper()
	wrapped := Gzip()(h)
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	if acceptGzip {
		req.Header.Set("Accept-Encoding", "gzip")
	}
	wrapped.ServeHTTP(rr, req)
	return rr
}

func gunzipBody(t *testing.T, body []byte) []byte {
	t.Helper()
	zr, err := gzip.NewReader(bytes.NewReader(body))
	if err != nil {
		t.Fatalf("gzip reader: %v", err)
	}
	defer zr.Close()
	got, err := io.ReadAll(zr)
	if err != nil {
		t.Fatalf("gunzip body: %v", err)
	}
	return got
}

func assertSingleVary(t *testing.T, h http.Header, value string) {
	t.Helper()
	count := 0
	for _, existing := range h.Values("Vary") {
		for _, part := range strings.Split(existing, ",") {
			if strings.EqualFold(strings.TrimSpace(part), value) {
				count++
			}
		}
	}
	if count != 1 {
		t.Fatalf("Vary contains %q %d times in %v, want once", value, count, h.Values("Vary"))
	}
}
