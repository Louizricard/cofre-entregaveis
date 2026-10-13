import 'package:flutter/material.dart';

class PrivateMedia extends StatelessWidget {
  final String url;
  final bool audio;
  const PrivateMedia({super.key, required this.url, required this.audio});
  @override
  Widget build(BuildContext context) => Text(
    audio
        ? 'Reprodutor de áudio disponível no navegador.'
        : 'Reprodutor de vídeo disponível no navegador.',
  );
}
