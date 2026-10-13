import 'dart:js_interop';

import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

class PrivateMedia extends StatefulWidget {
  final String url;
  final bool audio;
  const PrivateMedia({super.key, required this.url, required this.audio});
  @override
  State<PrivateMedia> createState() => _PrivateMediaState();
}

class _PrivateMediaState extends State<PrivateMedia> {
  web.HTMLMediaElement? _player;
  bool _error = false;
  @override
  void dispose() {
    _player?.pause();
    _player?.removeAttribute('src');
    _player?.load();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_error)
      return const Padding(
        padding: EdgeInsets.all(20),
        child: Text(
          'Não foi possível reproduzir. Clique em Atualizar para renovar a prévia.',
        ),
      );
    final player = HtmlElementView.fromTagName(
      tagName: widget.audio ? 'audio' : 'video',
      onElementCreated: (element) {
        final media = element as web.HTMLMediaElement;
        _player = media;
        media.controls = true;
        media.autoplay = false;
        media.preload = 'metadata';
        media.setAttribute('crossorigin', 'anonymous');
        media.setAttribute('playsinline', '');
        media.style.width = '100%';
        media.style.height = '100%';
        media.addEventListener(
          'error',
          ((web.Event _) {
            if (mounted) setState(() => _error = true);
          }).toJS,
        );
        media.src = widget.url;
      },
    );
    return widget.audio
        ? SizedBox(height: 72, child: player)
        : AspectRatio(aspectRatio: 16 / 9, child: player);
  }
}
